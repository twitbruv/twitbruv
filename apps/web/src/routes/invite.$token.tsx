import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { Avatar } from "../components/avatar"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge } from "../components/verified-badge"
import type { InvitePreview } from "../lib/api"

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useParams()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    setPreview(null)
    setError(null)
    api
      .invitePreview(token)
      .then((r) => setPreview(r.invite))
      .catch((e) => {
        const msg =
          e instanceof ApiError
            ? e.code === "expired"
              ? "This invite has expired."
              : e.code === "exhausted"
                ? "This invite has reached its max uses."
                : e.code === "revoked"
                  ? "This invite has been revoked."
                  : "This invite is invalid or no longer exists."
            : "Couldn't load this invite."
        setError(msg)
      })
  }, [token])

  async function accept() {
    if (accepting) return
    if (!session) {
      // Bounce through login then come back here.
      router.navigate({
        to: "/login",
        search: { redirect: `/invite/${token}` },
      })
      return
    }
    setAccepting(true)
    try {
      const { id } = await api.inviteAccept(token)
      router.navigate({
        to: "/inbox/$conversationId",
        params: { conversationId: id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't join")
    } finally {
      setAccepting(false)
    }
  }

  if (error) {
    return (
      <PageFrame>
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-lg font-semibold">Can't join</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </main>
      </PageFrame>
    )
  }
  if (!preview) {
    return (
      <PageFrame>
        <main className="px-4 py-16 text-center text-sm text-muted-foreground">
          loading…
        </main>
      </PageFrame>
    )
  }

  const conv = preview.conversation
  const title =
    conv.title ||
    conv.previewMembers
      .slice(0, 3)
      .map((m) => m.displayName ?? (m.handle ? `@${m.handle}` : "user"))
      .join(", ")
  const soloPeer =
    conv.kind === "dm" && !conv.title && conv.previewMembers.length === 1
      ? conv.previewMembers[0]
      : null

  return (
    <PageFrame>
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-lg border border-border p-6 text-center">
          <div className="mb-4 flex justify-center -space-x-2">
            {conv.previewMembers.slice(0, 4).map((m) => (
              <Avatar
                key={m.id}
                initial={(m.displayName || m.handle || "?")
                  .slice(0, 1)
                  .toUpperCase()}
                src={m.avatarUrl}
                className="size-12 ring-2 ring-background"
              />
            ))}
          </div>
          <h1 className="flex items-center justify-center gap-1.5 text-lg font-semibold">
            {title}
            {soloPeer?.isVerified && (
              <VerifiedBadge size={16} role={soloPeer.role} />
            )}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {conv.kind === "group" ? "Group conversation" : "Conversation"} ·{" "}
            {conv.memberCount} member{conv.memberCount === 1 ? "" : "s"}
          </p>
          {preview.expiresAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Invite expires {new Date(preview.expiresAt).toLocaleString()}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={accept} disabled={accepting}>
              {accepting
                ? "Joining…"
                : session
                  ? "Join conversation"
                  : "Sign in to join"}
            </Button>
          </div>
        </div>
      </main>
    </PageFrame>
  )
}
