import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLength, decodeLength, encodeSentence, toSentence } from '../services/mikrotik/protocol';
import { encryptSecret, decryptSecret } from '../utils/crypto';
import { randomCode } from '../services/voucherGenerator';

test('length prefixes round-trip across every width band', () => {
  for (const length of [0, 1, 0x7f, 0x80, 0x3fff, 0x4000, 0x1fffff, 0x200000, 0x0fffffff]) {
    const encoded = encodeLength(length);
    const decoded = decodeLength(encoded, 0);
    assert.equal(decoded?.length, length, `failed at ${length}`);
    assert.equal(decoded?.bytesRead, encoded.length);
  }
});

test('a sentence is terminated by a zero-length word', () => {
  const encoded = encodeSentence(['/login', '=name=admin']);
  assert.equal(encoded[encoded.length - 1], 0);
});

test('attribute words parse even when the value contains an equals sign', () => {
  const sentence = toSentence(['!re', '=comment=a=b', '=name=X']);
  assert.equal(sentence.attributes.comment, 'a=b');
  assert.equal(sentence.attributes.name, 'X');
});

test('secrets round-trip and tampering is rejected', () => {
  const key = Buffer.alloc(32, 7);
  const sealed = encryptSecret('D4BKB3UD', key);
  assert.notEqual(sealed, 'D4BKB3UD');
  assert.equal(decryptSecret(sealed, key), 'D4BKB3UD');

  const tampered = sealed.slice(0, -2) + (sealed.endsWith('00') ? '11' : '00');
  assert.throws(() => decryptSecret(tampered, key));
});

test('generated codes avoid characters that are misread off a printed card', () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code = randomCode(2000, alphabet);
  assert.equal(code.length, 2000);
  assert.match(code, /^[A-HJKMNP-Z2-9]+$/);
});
