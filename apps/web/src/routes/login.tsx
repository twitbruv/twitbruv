import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
// import { Separator } from "@workspace/ui/components/separator"
import { authClient } from "../lib/auth"

export const Route = createFileRoute("/login")({ component: Login })

function Login() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await authClient.signIn.email({ email, password })
      if (err) throw new Error(err.message ?? "Sign in failed")
      router.navigate({ to: "/" })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed")
    } finally {
      setLoading(false)
    }
  }

  // async function onMagicLink() {
  //   setError(null)
  //   if (!email.trim()) {
  //     setError("Enter your email first.")
  //     return
  //   }
  //   setLoading(true)
  //   try {
  //     const { error: err } = await authClient.signIn.magicLink({ email })
  //     if (err) throw new Error(err.message ?? "Magic link failed")
  //     setError("Check your email for a sign-in link.")
  //   } catch (e) {
  //     setError(e instanceof Error ? e.message : "Magic link failed")
  //   } finally {
  //     setLoading(false)
  //   }
  // }

  // async function onProvider(provider: "github" | "gitlab" | "google") {
  //   await authClient.signIn.social({ provider, callbackURL: "/" })
  // }

  const errorLower = error?.toLowerCase() ?? ""
  const isInfoFeedback =
    errorLower.includes("check your email") &&
    !errorLower.includes("enter your email")
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your email and password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <Alert variant={isInfoFeedback ? "default" : "destructive"}>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              size="lg"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          {/* Magic-link sign-in and social providers temporarily hidden:

            <Button variant="ghost" className="w-full" size="sm" onClick={onMagicLink} type="button" disabled={loading}>
              Email me a sign-in link
            </Button>
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" type="button" onClick={() => onProvider("github")}>
                Continue with GitHub
              </Button>
              <Button variant="outline" className="w-full" type="button" onClick={() => onProvider("gitlab")}>
                Continue with GitLab
              </Button>
              <Button variant="outline" className="w-full" type="button" onClick={() => onProvider("google")}>
                Continue with Google
              </Button>
            </div>
          */}
          <p className="text-center text-xs text-muted-foreground">
            No account?{" "}
            <Link
              to="/signup"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
