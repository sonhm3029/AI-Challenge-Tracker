import { timingSafeEqual } from "node:crypto";

/**
 * Node-only half of admin auth (Section 22 password check). Kept separate
 * from lib/adminAuth.ts, which middleware.ts imports under the Edge
 * runtime — Edge bundling rejects `node:crypto`, so only Server Actions
 * (Node runtime) should import this file.
 */
export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
