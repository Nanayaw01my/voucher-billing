import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { decodeLength, encodeSentence, toSentence, type Sentence } from './protocol';

export interface RouterOsClientOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
  timeoutMs: number;
}

export class RouterOsApiError extends Error {
  constructor(message: string, public readonly category: 'AUTH' | 'TRAP' | 'FATAL' | 'TIMEOUT' | 'NETWORK') {
    super(message);
    this.name = 'RouterOsApiError';
  }
}

type Pending = {
  resolve: (rows: Record<string, string>[]) => void;
  reject: (err: Error) => void;
  rows: Record<string, string>[];
  timer: NodeJS.Timeout;
};

/**
 * One TCP (or TLS) connection to a single router. Commands are serialised with
 * a `.tag` so replies can never be attributed to the wrong request.
 */
export class RouterOsClient extends EventEmitter {
  private socket?: net.Socket | tls.TLSSocket;
  private buffer = Buffer.alloc(0);
  private words: string[] = [];
  private readonly pending = new Map<string, Pending>();
  private tagCounter = 0;
  private connected = false;
  private closed = false;

  constructor(private readonly options: RouterOsClientOptions) {
    super();
  }

  get isConnected(): boolean {
    return this.connected && !this.closed;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.openSocket();
    await this.login();
    this.connected = true;
  }

  private openSocket(): Promise<void> {
    const { host, port, useTls, timeoutMs } = this.options;
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        cleanup();
        reject(new RouterOsApiError(err.message, 'NETWORK'));
      };
      const onTimeout = () => {
        cleanup();
        socket.destroy();
        reject(new RouterOsApiError(`connection timed out after ${timeoutMs}ms`, 'TIMEOUT'));
      };
      const onReady = () => {
        cleanup();
        socket.setTimeout(0);
        resolve();
      };
      const cleanup = () => {
        socket.removeListener('error', onError);
        socket.removeListener('timeout', onTimeout);
      };

      const socket = useTls
        // Many RouterOS installs use a self-signed certificate on api-ssl, so
        // verification is off by default; set NODE_EXTRA_CA_CERTS to pin one.
        ? tls.connect({ host, port, rejectUnauthorized: false }, onReady)
        : net.createConnection({ host, port }, onReady);

      this.socket = socket;
      socket.setTimeout(timeoutMs);
      socket.once('error', onError);
      socket.once('timeout', onTimeout);
      socket.on('data', (chunk) => this.onData(chunk));
      socket.on('close', () => this.onClose());
    });
  }

  /**
   * RouterOS 6.43+ accepts the password in the /login sentence directly.
   * Older builds answer the first /login with a `ret` challenge and expect the
   * legacy MD5 response, so both paths are handled.
   */
  private async login(): Promise<void> {
    const { username, password } = this.options;
    let rows: Record<string, string>[];
    try {
      rows = await this.send(['/login', `=name=${username}`, `=password=${password}`]);
    } catch (err) {
      if (err instanceof RouterOsApiError && err.category === 'TRAP') {
        throw new RouterOsApiError('authentication failed (check username and password)', 'AUTH');
      }
      throw err;
    }

    const challenge = rows[0]?.ret;
    if (!challenge) return; // 6.43+ -- already authenticated.

    const digest = crypto
      .createHash('md5')
      .update(Buffer.concat([Buffer.from([0]), Buffer.from(password, 'utf8'), Buffer.from(challenge, 'hex')]))
      .digest('hex');
    try {
      await this.send(['/login', `=name=${username}`, `=response=00${digest}`]);
    } catch {
      throw new RouterOsApiError('authentication failed (check username and password)', 'AUTH');
    }
  }

  /** Sends one command sentence and resolves with every `!re` row it produced. */
  send(words: string[]): Promise<Record<string, string>[]> {
    if (this.closed) return Promise.reject(new RouterOsApiError('connection closed', 'NETWORK'));
    const socket = this.socket;
    if (!socket) return Promise.reject(new RouterOsApiError('not connected', 'NETWORK'));

    const tag = String(++this.tagCounter);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(tag);
        reject(new RouterOsApiError(`command timed out after ${this.options.timeoutMs}ms`, 'TIMEOUT'));
      }, this.options.timeoutMs);

      this.pending.set(tag, { resolve, reject, rows: [], timer });
      socket.write(encodeSentence([...words, `.tag=${tag}`]), (err) => {
        if (err) {
          this.settle(tag, () => reject(new RouterOsApiError(err.message, 'NETWORK')));
        }
      });
    });
  }

  private settle(tag: string, run: () => void): void {
    const entry = this.pending.get(tag);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(tag);
    run();
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let offset = 0;

    for (;;) {
      const header = decodeLength(this.buffer, offset);
      if (!header) break;
      const start = offset + header.bytesRead;
      if (header.length === 0) {
        // End of sentence.
        offset = start;
        const words = this.words;
        this.words = [];
        if (words.length) this.dispatch(words);
        continue;
      }
      if (start + header.length > this.buffer.length) break;
      this.words.push(this.buffer.subarray(start, start + header.length).toString('utf8'));
      offset = start + header.length;
    }

    if (offset > 0) this.buffer = this.buffer.subarray(offset);
  }

  private dispatch(words: string[]): void {
    const tagWord = words.find((w) => w.startsWith('.tag='));
    const tag = tagWord ? tagWord.slice(5) : '';
    const sentence: Sentence = toSentence(words.filter((w) => !w.startsWith('.tag=')));
    const entry = this.pending.get(tag);
    if (!entry) return;

    switch (sentence.type) {
      case '!re':
        entry.rows.push(sentence.attributes);
        break;
      case '!done':
        if (Object.keys(sentence.attributes).length) entry.rows.push(sentence.attributes);
        this.settle(tag, () => entry.resolve(entry.rows));
        break;
      case '!trap':
        this.settle(tag, () =>
          entry.reject(new RouterOsApiError(sentence.attributes.message ?? 'router rejected the command', 'TRAP')),
        );
        break;
      case '!fatal':
        this.settle(tag, () =>
          entry.reject(new RouterOsApiError(sentence.attributes.message ?? 'router closed the session', 'FATAL')),
        );
        break;
      default:
        break;
    }
  }

  private onClose(): void {
    this.connected = false;
    this.closed = true;
    for (const [tag, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(tag);
      entry.reject(new RouterOsApiError('connection closed by router', 'NETWORK'));
    }
    this.emit('close');
  }

  close(): void {
    this.closed = true;
    this.socket?.destroy();
  }
}
