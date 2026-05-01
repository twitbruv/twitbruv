import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { passwordResetRequestSchema } from "@workspace/validators"
import { authClient } from "../lib/auth"

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
})

function ForgotPassword() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = passwordResetRequestSchema.safeParse({ email })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid email")
      return
    }
    setLoading(true)
    try {
      const { error: err } = await authClient.requestPasswordReset({
        email: parsed.data.email,
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) throw new Error(err.message ?? "Request failed")
      setSent(true)
      toast.success(
        "If this email exists in our system, check your inbox for a reset link."
      )
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <Card.Header className="flex flex-col gap-2 px-5 pt-5 pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Forgot password
          </h1>
          <p className="text-sm leading-6 text-tertiary">
            {sent
              ? "If this email exists in our system, check your inbox for a reset link."
              : "Enter your email and we'll send you a reset link."}
          </p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5 px-5 pb-5">
          {!sent ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="h-10"
                  required
                />
              </div>
              <Button
                type="submit"
                className="mt-1 h-10 w-full"
                variant="primary"
                disabled={loading}
                size="md"
              >
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          ) : null}
          <p className="text-muted-foreground text-center text-sm">
            <Link
              to="/login"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </Card.Content>
      </Card>
    </div>
  )
}
