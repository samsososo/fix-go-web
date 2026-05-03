import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, existing] = storedHash.split(":");
  if (!salt || !existing) {
    return false;
  }

  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const existingBuffer = Buffer.from(existing, "hex");
  if (derived.length !== existingBuffer.length) {
    return false;
  }

  return timingSafeEqual(derived, existingBuffer);
}

export function createOpaqueToken() {
  return `${randomUUID()}_${randomBytes(24).toString("base64url")}`;
}
