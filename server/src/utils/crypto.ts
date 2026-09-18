import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Envelope encryption for secrets that must be reproduced verbatim later
 * (router logins, voucher passwords printed on cards). Operator passwords
 * are NOT stored this way -- they are one-way bcrypt hashes.
 *
 * Format: v1:<iv hex>:<authTag hex>:<ciphertext hex>
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed encrypted payload');
  const [, ivHex, tagHex, dataHex] = parts as [string, string, string, string];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
