import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Avatar } from "@workspace/ui/components/avatar"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge, resolveBadgeTier } from "../components/verified-badge"
import { qk } from "../lib/query-keys"
import { PageLoading } from "@/components/page-surface"

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
})

function invitePreviewErrMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "expired") return "This invite has expired."
    if (e.code === "exhausted") return "This invite has reached its max uses."
    if (e.code === "revoked") return "This invite has been revoked."
    return "This invite is invalid or no longer exists."
  }
  return "Couldn't load this invite."
}

function InvitePage() {
  const { token } = Route.useParams()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  const {
    data: preview,
    error: previewErr,
    isPending,
  } = useQuery({
    queryKey: qk.invitePreview(token),
    queryFn: async () => (await api.invitePreview(token)).invite,
    retry: false,
  })

  async function accept() {
    if (accepting) return
    setAcceptError(null)
    if (!session) {
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
      setAcceptError(e instanceof Error ? e.message : "couldn't join")
    } finally {
      setAccepting(false)
    }
  }

  if (previewErr) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-lg font-semibold">Can't join</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {invitePreviewErrMsg(previewErr)}
          </p>
        </div>
      </PageFrame>
    )
  }
  if (isPending) {
    return (
      <PageFrame>
        <PageLoading className="py-8" label="Loading…" />
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
      <div className="mx-auto max-w-md px-4 py-16">
        {acceptError && (
          <p className="text-destructive mb-4 text-center text-sm">
            {acceptError}
          </p>
        )}
        <div className="border-border rounded-lg border p-6 text-center">
          <div className="mb-4 flex justify-center -space-x-2">
            {conv.previewMembers.slice(0, 4).map((m) => (
              <Avatar
                key={m.id}
                initial={(m.displayName || m.handle || "?")
                  .slice(0, 1)
                  .toUpperCase()}
                src={m.avatarUrl}
                className="ring-background size-12 ring-2"
              />
            ))}
          </div>
          <h1 className="flex items-center justify-center gap-1.5 text-lg font-semibold">
            {title}
            {(() => {
              const tier = soloPeer ? resolveBadgeTier(soloPeer) : null
              return tier ? <VerifiedBadge size={16} role={tier} /> : null
            })()}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {conv.kind === "group" ? "Group conversation" : "Conversation"} ·{" "}
            {conv.memberCount} member{conv.memberCount === 1 ? "" : "s"}
          </p>
          {preview.expiresAt && (
            <p className="text-muted-foreground mt-2 text-xs">
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
      </div>
    </PageFrame>
  )
}
