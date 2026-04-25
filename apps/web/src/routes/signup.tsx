import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { signUpSchema } from "@workspace/validators"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"

export const Route = createFileRoute("/signup")({ component: SignUp })

function SignUp() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [handle, setHandle] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = signUpSchema.safeParse({
      email,
      password,
      handle,
      displayName,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "invalid input")
      return
    }
    setLoading(true)
    try {
      const { error: err } = await authClient.signUp.email({
        email,
        password,
        name: displayName || handle,
      })
      if (err) throw new Error(err.message ?? "sign up failed")
      await api.claimHandle(handle).catch(() => {})
      router.navigate({ to: "/settings" })
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign up failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold">Create an account</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Free forever. No ads. Check your email to verify before posting.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="handle">Handle</Label>
          <Input
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="yourhandle"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Name"
          />
        </div>
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
            minLength={10}
            required
          />
          <p className="text-xs text-muted-foreground">
            At least 10 characters.
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading} size="lg">
          {loading ? "creating…" : "Create account"}
        </Button>
      </form>
    </main>
  )
}
