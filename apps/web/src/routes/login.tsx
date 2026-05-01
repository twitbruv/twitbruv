import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { authClient } from "../lib/auth"

export const Route = createFileRoute("/login")({ component: Login })

function Login() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [pkLoading, setPkLoading] = useState(false)
  const [canUsePasskeys, setCanUsePasskeys] = useState(false)
  const warmupCancelledRef = useRef(false)

  useEffect(() => {
    warmupCancelledRef.current = false
    async function warmup() {
      if (typeof PublicKeyCredential === "undefined") {
        return
      }
      setCanUsePasskeys(true)
      const available =
        typeof PublicKeyCredential.isConditionalMediationAvailable ===
        "function"
          ? await PublicKeyCredential.isConditionalMediationAvailable()
          : false
      if (!available) return
      const res = await authClient.signIn.passkey({
        autoFill: true,
      })
      if (warmupCancelledRef.current) return
      if (res.error) return
      router.navigate({ to: "/" })
    }
    void warmup()
    return () => {
      warmupCancelledRef.current = true
    }
  }, [router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { error: err } = await authClient.signIn.email({ email, password })
      if (err) throw new Error(err.message ?? "Sign in failed")
      router.navigate({ to: "/" })
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sign in failed")
    } finally {
      setLoading(false)
    }
  }

  async function onPasskey() {
    if (loading || pkLoading) return
    setPkLoading(true)
    try {
      const res = await authClient.signIn.passkey({
        autoFill: false,
      })
      if (res.error) {
        const code = "code" in res.error ? res.error.code : undefined
        if (code === "AUTH_CANCELLED") return
        throw new Error(res.error.message ?? "Passkey sign-in failed")
      }
      router.navigate({ to: "/" })
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Passkey sign-in failed"
      )
    } finally {
      setPkLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <Card.Header className="flex flex-col gap-2 px-5 pt-5 pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Welcome back
          </h1>
          <p className="text-sm leading-6 text-tertiary">
            Email and password or a passkey linked to your account.
          </p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5 px-5 pb-5">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username webauthn"
                className="h-10"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password webauthn"
                className="h-10"
                required
              />
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
            <Button
              type="submit"
              className="mt-1 h-10 w-full"
              variant="primary"
              disabled={loading || pkLoading}
              size="md"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          {canUsePasskeys ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-muted-foreground shrink-0 text-xs">
                  or
                </span>
                <Separator className="flex-1" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                size="md"
                disabled={loading || pkLoading}
                onClick={() => void onPasskey()}
              >
                {pkLoading ? "Waiting for passkey…" : "Continue with passkey"}
              </Button>
            </div>
          ) : null}
          <p className="text-muted-foreground text-center text-sm">
            No account?{" "}
            <Link
              to="/signup"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </p>
        </Card.Content>
      </Card>
    </div>
  )
}
