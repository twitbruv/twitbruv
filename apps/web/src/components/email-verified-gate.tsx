import { useMe } from "../lib/me"
import { EmailVerifyScreen } from "./email-verify-screen"
import type { ReactNode } from "react"

// Whole-app lockout for unverified emails. Sits inside <MeProvider> (so useMe() works) and
// around the rest of the app so the verification screen replaces the entire UI until the
// user clicks the link in their email. The MeProvider polls /api/me, and the verify screen
// polls faster on top, so the unlock is automatic — no manual refresh.
export function EmailVerifiedGate({ children }: { children: ReactNode }) {
  const { me } = useMe()
  if (me && !me.emailVerified) {
    return <EmailVerifyScreen email={me.email} />
  }
  return <>{children}</>
}
