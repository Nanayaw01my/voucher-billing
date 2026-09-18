/**
 * RouterOS binary API wire format.
 *
 * A *sentence* is a sequence of length-prefixed *words* terminated by a
 * zero-length word. The length prefix is variable width, exactly as documented
 * by MikroTik:
 *
 *   len < 0x80        -> 1 byte
 *   len < 0x4000      -> 2 bytes, or 0x8000
 *   len < 0x200000    -> 3 bytes, or 0xC00000
 *   len < 0x10000000  -> 4 bytes, or 0xE0000000
 *   otherwise         -> 0xF0 followed by 4 bytes
 *
 * This format is identical in RouterOS v6 and v7.
 */

export function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x4000) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(length | 0x8000);
    return b;
  }
  if (length < 0x200000) {
    const value = length | 0xc00000;
    return Buffer.from([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
  }
  if (length < 0x10000000) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE((length | 0xe0000000) >>> 0);
    return b;
  }
  const b = Buffer.alloc(5);
  b.writeUInt8(0xf0, 0);
  b.writeUInt32BE(length, 1);
  return b;
}

export function encodeWord(word: string): Buffer {
  const payload = Buffer.from(word, 'utf8');
  return Buffer.concat([encodeLength(payload.length), payload]);
}

export function encodeSentence(words: string[]): Buffer {
  return Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);
}

export interface DecodedLength {
  length: number;
  bytesRead: number;
}

/** Returns null when the buffer does not yet hold a complete length prefix. */
export function decodeLength(buf: Buffer, offset: number): DecodedLength | null {
  if (offset >= buf.length) return null;
  const first = buf[offset] as number;

  if ((first & 0x80) === 0x00) return { length: first, bytesRead: 1 };
  if ((first & 0xc0) === 0x80) {
    if (offset + 2 > buf.length) return null;
    return { length: buf.readUInt16BE(offset) & ~0x8000, bytesRead: 2 };
  }
  if ((first & 0xe0) === 0xc0) {
    if (offset + 3 > buf.length) return null;
    const value = ((buf[offset] as number) << 16) | ((buf[offset + 1] as number) << 8) | (buf[offset + 2] as number);
    return { length: value & ~0xc00000, bytesRead: 3 };
  }
  if ((first & 0xf0) === 0xe0) {
    if (offset + 4 > buf.length) return null;
    return { length: buf.readUInt32BE(offset) & ~0xe0000000, bytesRead: 4 };
  }
  if (first === 0xf0) {
    if (offset + 5 > buf.length) return null;
    return { length: buf.readUInt32BE(offset + 1), bytesRead: 5 };
  }
  throw new Error(`Unsupported RouterOS length prefix: 0x${first.toString(16)}`);
}

/** `=name=value` -> ['name', 'value']. Values may themselves contain '='. */
export function parseAttributeWord(word: string): [string, string] | null {
  if (!word.startsWith('=')) return null;
  const separator = word.indexOf('=', 1);
  if (separator === -1) return [word.slice(1), ''];
  return [word.slice(1, separator), word.slice(separator + 1)];
}

export type SentenceType = '!re' | '!done' | '!trap' | '!fatal' | string;

export interface Sentence {
  type: SentenceType;
  attributes: Record<string, string>;
}

export function toSentence(words: string[]): Sentence {
  const [type, ...rest] = words;
  const attributes: Record<string, string> = {};
  for (const word of rest) {
    const pair = parseAttributeWord(word);
    if (pair) attributes[pair[0]] = pair[1];
  }
  return { type: type ?? '', attributes };
}
