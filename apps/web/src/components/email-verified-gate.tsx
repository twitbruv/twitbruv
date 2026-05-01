import { useMe } from "../lib/me"
import { EmailVerifyScreen } from "./email-verify-screen"
import type { ReactNode } from "react"

export function EmailVerifiedGate({ children }: { children: ReactNode }) {
  const { me } = useMe()
  if (me && !me.emailVerified) {
    return <EmailVerifyScreen email={me.email} />
  }
  return <>{children}</>
}
