import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { passwordResetSchema } from "@workspace/validators"
import { authClient } from "../lib/auth"

type ResetPasswordSearch = {
  token?: string
  error?: string
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPassword,
})

function ResetPassword() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const invalid =
    !search.token || search.error === "INVALID_TOKEN" || Boolean(search.error)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!search.token) return
    const parsed = passwordResetSchema.safeParse({
      token: search.token,
      password,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input")
      return
    }
    setLoading(true)
    try {
      const { error: err } = await authClient.resetPassword({
        token: parsed.data.token,
        newPassword: parsed.data.password,
      })
      if (err) throw new Error(err.message ?? "Reset failed")
      toast.success("Password updated. Sign in with your new password.")
      await navigate({ to: "/login" })
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Reset failed")
    } finally {
      setLoading(false)
    }
  }

  if (invalid) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <Card.Header className="flex flex-col gap-2 px-5 pt-5 pb-4">
            <h1 className="text-xl font-semibold tracking-tight text-primary">
              Link invalid or expired
            </h1>
            <p className="text-sm leading-6 text-tertiary">
              Request a new reset link to continue.
            </p>
          </Card.Header>
          <Card.Content className="flex flex-col gap-4 px-5 pb-5">
            <Button
              type="button"
              variant="primary"
              className="h-10 w-full"
              size="md"
              onClick={() => navigate({ to: "/forgot-password" })}
            >
              Request new link
            </Button>
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

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <Card.Header className="flex flex-col gap-2 px-5 pt-5 pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Set new password
          </h1>
          <p className="text-sm leading-6 text-tertiary">
            Choose a password with at least 10 characters.
          </p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5 px-5 pb-5">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                autoComplete="new-password"
                className="h-10"
                required
              />
              <p className="text-muted-foreground text-sm">
                At least 10 characters.
              </p>
            </div>
            <Button
              type="submit"
              className="mt-1 h-10 w-full"
              variant="primary"
              disabled={loading}
              size="md"
            >
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
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
