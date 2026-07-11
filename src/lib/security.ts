import { randomBytes, randomUUID } from "node:crypto";

export function createOpaqueToken() {
  return `${randomUUID()}_${randomBytes(24).toString("base64url")}`;
}
