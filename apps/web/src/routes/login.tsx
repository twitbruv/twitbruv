import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
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
      if (err) throw new Error(err.message ?? "sign in failed")
      router.navigate({ to: "/" })
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign in failed")
    } finally {
      setLoading(false)
    }
  }

  async function onMagicLink() {
    setError(null)
    if (!email) {
      setError("enter email first")
      return
    }
    setLoading(true)
    try {
      const { error: err } = await authClient.signIn.magicLink({ email })
      if (err) throw new Error(err.message ?? "magic link failed")
      setError("check your email")
    } catch (e) {
      setError(e instanceof Error ? e.message : "magic link failed")
    } finally {
      setLoading(false)
    }
  }

  async function onProvider(provider: "github" | "gitlab" | "google") {
    await authClient.signIn.social({ provider, callbackURL: "/" })
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading} size="lg">
          {loading ? "signing in…" : "Sign in"}
        </Button>
      </form>
      <Button
        variant="ghost"
        className="mt-2 w-full"
        size="sm"
        onClick={onMagicLink}
      >
        email me a sign-in link
      </Button>
      <div className="my-6 flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onProvider("github")}
        >
          Continue with GitHub
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onProvider("gitlab")}
        >
          Continue with GitLab
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onProvider("google")}
        >
          Continue with Google
        </Button>
      </div>
    </main>
  )
}
