/**
 * WebCrypto only. Two uses:
 *  - encrypted backups: PBKDF2-SHA256 → AES-256-GCM over the raw SQLite file
 *  - app passcode: PBKDF2-SHA256 hash stored locally (a gate, not encryption)
 *
 * Container layout (`.journalbackup`):
 *   bytes 0..4   magic "JRNL1"
 *   bytes 5..20  salt (16)
 *   bytes 21..32 iv (12)
 *   bytes 33..36 iterations (uint32 big-endian)
 *   bytes 37..   AES-GCM ciphertext + 16-byte tag
 */

export const BACKUP_MAGIC = "JRNL1";
export const DEFAULT_ITERATIONS = 600_000;

const MAGIC_BYTES = new TextEncoder().encode(BACKUP_MAGIC);
const SALT_LEN = 16;
const IV_LEN = 12;
const HEADER_LEN = MAGIC_BYTES.length + SALT_LEN + IV_LEN + 4;

export interface PasscodeRecord {
  salt: string;
  hash: string;
  iterations: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2Bits(secret: string, salt: Uint8Array, iterations: number, bits: number): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, material, bits);
}

/** PBKDF2-SHA256 over the passphrase → non-extractable AES-GCM-256 key. */
export async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number = DEFAULT_ITERATIONS): Promise<CryptoKey> {
  const bits = await pbkdf2Bits(passphrase, salt, iterations, 256);
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encrypt(bytes: Uint8Array, passphrase: string, iterations: number = DEFAULT_ITERATIONS): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt, iterations);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes as BufferSource));
  const out = new Uint8Array(HEADER_LEN + cipher.length);
  let o = 0;
  out.set(MAGIC_BYTES, o);
  o += MAGIC_BYTES.length;
  out.set(salt, o);
  o += SALT_LEN;
  out.set(iv, o);
  o += IV_LEN;
  new DataView(out.buffer).setUint32(o, iterations, false);
  o += 4;
  out.set(cipher, o);
  return out;
}

export function isBackupContainer(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_LEN) return false;
  for (let i = 0; i < MAGIC_BYTES.length; i++) if (bytes[i] !== MAGIC_BYTES[i]) return false;
  return true;
}

/** Throws "not a journal backup" on a bad header and "wrong passphrase or corrupted backup" on GCM failure. */
export async function decrypt(container: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!isBackupContainer(container)) throw new Error("not a journal backup");
  let o = MAGIC_BYTES.length;
  const salt = container.subarray(o, o + SALT_LEN);
  o += SALT_LEN;
  const iv = container.subarray(o, o + IV_LEN);
  o += IV_LEN;
  const iterations = new DataView(container.buffer, container.byteOffset).getUint32(o, false);
  o += 4;
  if (iterations < 1000 || iterations > 10_000_000) throw new Error("not a journal backup");
  const key = await deriveKey(passphrase, salt, iterations);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, container.subarray(o) as BufferSource));
  } catch {
    throw new Error("wrong passphrase or corrupted backup");
  }
}

export async function hashPasscode(passcode: string, iterations: number = DEFAULT_ITERATIONS): Promise<PasscodeRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const bits = await pbkdf2Bits(passcode, salt, iterations, 256);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(bits)), iterations };
}

export async function verifyPasscode(passcode: string, record: PasscodeRecord): Promise<boolean> {
  const bits = new Uint8Array(await pbkdf2Bits(passcode, base64ToBytes(record.salt), record.iterations, 256));
  const expected = base64ToBytes(record.hash);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}
