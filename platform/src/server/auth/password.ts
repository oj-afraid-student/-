import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP scrypt baseline: N=2^15, r=8, p=3; a separate random salt per password.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = 'scrypt$32768$8$3';
const dummySalt = Buffer.alloc(16, 0x5a);
const dummyKey = Buffer.alloc(64, 0xa5);

function key(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await key(password, salt);
  return `${prefix}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(
  password: string,
  encoded: string | undefined,
): Promise<boolean> {
  const fields = encoded?.split('$');
  const valid =
    fields?.length === 6 &&
    fields.slice(0, 4).join('$') === prefix &&
    /^[A-Za-z0-9_-]{22}$/.test(fields[4]) &&
    /^[A-Za-z0-9_-]{86}$/.test(fields[5]);
  // Unknown users and malformed hashes still perform the same expensive derivation.
  const salt = valid ? Buffer.from(fields[4], 'base64url') : dummySalt;
  const expected = valid ? Buffer.from(fields[5], 'base64url') : dummyKey;
  const derived = await key(password, salt);
  const matches = timingSafeEqual(derived, expected);
  return Boolean(valid && matches);
}
