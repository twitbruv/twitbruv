import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { IconLock, IconUsers } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { Compose } from "../components/compose"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import type { Community, Post } from "../lib/api"

export const Route = createFileRoute("/c/$slug")({ component: CommunityView })

function CommunityView() {
  const { slug } = Route.useParams()
  const [community, setCommunity] = useState<Community | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newPost, setNewPost] = useState<Post | null>(null)

  async function refresh() {
    try {
      const { community: c } = await api.communityBySlug(slug)
      setCommunity(c)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "not found")
    }
  }
  useEffect(() => {
    refresh()
  }, [slug])

  const load = useCallback(
    (cursor?: string) =>
      community ? api.communityTimeline(community.id, cursor) : Promise.resolve({ posts: [], nextCursor: null }),
    [community],
  )

  async function join() {
    if (!community || busy) return
    setBusy(true)
    try {
      await api.joinCommunity(community.id)
      await refresh()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "couldn't join")
    } finally {
      setBusy(false)
    }
  }
  async function leave() {
    if (!community || busy) return
    if (!window.confirm(`Leave ${community.name}?`)) return
    setBusy(true)
    try {
      await api.leaveCommunity(community.id)
      await refresh()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "couldn't leave")
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <PageFrame>
        <main className="px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">community not found</p>
        </main>
      </PageFrame>
    )
  }
  if (!community) {
    return (
      <PageFrame>
        <main className="px-4 py-16">
          <p className="text-sm text-muted-foreground">loading…</p>
        </main>
      </PageFrame>
    )
  }

  const isMember =
    Boolean(community.viewer) && !community.viewer?.pendingApproval
  const isPending = Boolean(community.viewer?.pendingApproval)
  const canPost = isMember

  return (
    <PageFrame>
      <main>
        <header className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-1.5 text-lg font-semibold">
                {community.name}
                {community.visibility !== "public" && (
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <IconLock size={12} />
                    {community.visibility}
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">/c/{community.slug}</p>
              {community.description && (
                <p className="mt-2 max-w-prose text-sm">{community.description}</p>
              )}
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <IconUsers size={12} />
                {community.memberCount} {community.memberCount === 1 ? "member" : "members"}
              </p>
            </div>
            <div className="shrink-0">
              {community.viewer?.role === "owner" ? (
                <span className="text-xs text-muted-foreground">You own this</span>
              ) : isPending ? (
                <Button size="sm" variant="outline" disabled>
                  Request pending
                </Button>
              ) : isMember ? (
                <Button size="sm" variant="outline" onClick={leave} disabled={busy}>
                  Leave
                </Button>
              ) : (
                <Button size="sm" onClick={join} disabled={busy}>
                  {community.visibility === "public" ? "Join" : "Request to join"}
                </Button>
              )}
            </div>
          </div>
        </header>

        {canPost && (
          <Compose
            onCreated={async (post) => {
              try {
                await api.attachPostToCommunity(community.id, post.id)
                setNewPost(post)
              } catch {
                /* show as a regular post; community attach failed */
              }
            }}
            placeholder={`Post in ${community.name}`}
          />
        )}

        <Feed
          queryKey={["community", community.id]}
          load={load}
          emptyMessage={
            isMember
              ? "No posts in this community yet. Start the conversation."
              : "No posts in this community yet."
          }
          prependItem={newPost}
        />
      </main>
    </PageFrame>
  )
}
