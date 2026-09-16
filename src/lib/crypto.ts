import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Application-level AES-256-GCM encryption for sensitive fields (client
 * banking details). Postgres only ever stores the ciphertext produced
 * here — the key never reaches the database or the browser.
 *
 * `key_version` lets the key be rotated later: decrypt with the key for
 * the row's stored version, re-encrypt with the current version on next
 * write, no bulk migration required on rotation day.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const CURRENT_KEY_VERSION = 1;

function getKey(version: number): Buffer {
  const envVar = version === 1 ? "BANKING_ENCRYPTION_KEY" : `BANKING_ENCRYPTION_KEY_V${version}`;
  const base64Key = process.env[envVar];
  if (!base64Key) {
    throw new Error(`Missing encryption key for version ${version}: set ${envVar}`);
  }
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error(`${envVar} must decode to 32 bytes for AES-256 (got ${key.length})`);
  }
  return key;
}

export interface EncryptedField {
  ciphertext: string; // base64: encrypted bytes + auth tag appended
  iv: string; // base64
  keyVersion: number;
}

export function encryptField(plaintext: string): EncryptedField {
  const key = getKey(CURRENT_KEY_VERSION);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptField(field: EncryptedField): string {
  const key = getKey(field.keyVersion);
  const iv = Buffer.from(field.iv, "base64");
  const raw = Buffer.from(field.ciphertext, "base64");

  const authTag = raw.subarray(raw.length - 16);
  const encrypted = raw.subarray(0, raw.length - 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/** Last 4 digits of an account number, for masked display without decrypting. */
export function lastFour(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  return digits.slice(-4);
}

/** Constant-time comparison, useful for anything beyond this module that needs to compare secrets. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
