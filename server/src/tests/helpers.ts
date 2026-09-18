import http from 'http';
import type { Express } from 'express';

interface RequestOptions {
  token?: string;
  body?: unknown;
  file?: { field: string; filename: string; content: string };
}

/**
 * Drives the real Express app over a real socket, so middleware, multer and the
 * error handler are all exercised exactly as in production.
 */
export function httpRequest(
  app: Express,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, () => {
      const { port } = server.address() as { port: number };
      const headers: Record<string, string> = {};
      if (options.token) headers.Authorization = `Bearer ${options.token}`;

      let payload: Buffer | undefined;
      if (options.file) {
        const boundary = `----test${Date.now()}`;
        payload = Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${options.file.field}"; filename="${options.file.filename}"\r\n` +
          'Content-Type: text/plain\r\n\r\n' +
          `${options.file.content}\r\n--${boundary}--\r\n`,
        );
        headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        headers['Content-Length'] = String(payload.length);
      } else if (options.body !== undefined) {
        payload = Buffer.from(JSON.stringify(options.body));
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(payload.length);
      }

      const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          let body: unknown = text;
          try { body = JSON.parse(text); } catch { /* non-JSON response, e.g. CSV */ }
          resolve({ status: res.statusCode ?? 0, body });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}
