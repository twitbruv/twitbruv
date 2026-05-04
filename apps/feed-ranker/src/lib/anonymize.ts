import { createHmac } from "node:crypto"

export function hashUserId(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex")
}
