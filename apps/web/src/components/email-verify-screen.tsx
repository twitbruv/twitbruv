import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { RESEND_COOLDOWN_SEC } from "@workspace/validators/auth"
import { authClient } from "../lib/auth"
import { useMe } from "../lib/me"

const POLL_INTERVAL_MS = 5_000

export function EmailVerifyScreen({ email }: { email: string }) {
  const { refresh } = useMe()
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [sending, setSending] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback((sec: number) => {
    setSecondsLeft(sec)
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (tickRef.current) {
            clearInterval(tickRef.current)
            tickRef.current = null
          }
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const onResend = useCallback(async () => {
    if (sending || secondsLeft > 0) return
    setSending(true)
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/?verified=1`,
      })
      if (error) {
        const status = (error as { status?: number }).status
        if (status === 429) {
          toast.error("Slow down — wait before requesting another email.")
          startCountdown(RESEND_COOLDOWN_SEC)
        } else {
          toast.error(error.message ?? "Could not send verification email")
        }
        return
      }
      toast.success("Verification email sent")
      startCountdown(RESEND_COOLDOWN_SEC)
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not send verification email"
      )
    } finally {
      setSending(false)
    }
  }, [email, sending, secondsLeft, startCountdown])

  const onSignOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await authClient.signOut()
    } catch {}
    if (typeof window !== "undefined") {
      window.location.assign("/login")
    }
  }, [signingOut])

  const buttonLabel = sending
    ? "Sending…"
    : secondsLeft > 0
      ? `Resend in ${secondsLeft}s`
      : "Resend email"

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <Card.Header className="flex flex-col gap-2 px-5 pt-5 pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Verify your email
          </h1>
          <p className="text-sm leading-6 text-tertiary">
            We sent a verification link to{" "}
            <span className="font-medium text-primary">{email}</span>.
          </p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5 px-5 pb-5">
          <p className="text-muted-foreground text-sm leading-6">
            Click the link in your inbox to unlock your account. This page will
            refresh automatically once your email is verified.
          </p>
          <Button
            type="button"
            size="md"
            variant="primary"
            className="h-10 w-full"
            onClick={onResend}
            disabled={sending || secondsLeft > 0}
          >
            {buttonLabel}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            Wrong account?{" "}
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="text-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Use a different one
            </button>
          </p>
        </Card.Content>
      </Card>
    </div>
  )
}
