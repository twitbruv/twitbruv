import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { useMe } from "../lib/me"
import { useDelayedPresence } from "../lib/use-delayed-presence"
import { Compose } from "../components/compose"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import { ThreadViewContent } from "../components/thread-view"
import { homeThreadFromFeedSearch } from "../lib/home-from-feed"
import {
  HOME_PANEL_MIN_INSET_WIDTH,
  HOME_PANEL_PRESENCE_MS,
  useInsetMinWidth,
} from "../lib/use-media-query"
import type { Post } from "../lib/api"

type HomeSearch = { postId?: string; postHandle?: string }

export const Route = createFileRoute("/")({
  component: Landing,
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    postId: typeof search.postId === "string" ? search.postId : undefined,
    postHandle:
      typeof search.postHandle === "string" ? search.postHandle : undefined,
  }),
})

type FeedTab = "following" | "all"

function Landing() {
  const navigate = Route.useNavigate()
  const { postId, postHandle } = Route.useSearch()
  const { data: session, isPending } = authClient.useSession()
  const { me } = useMe()
  const isDesktop = useInsetMinWidth(HOME_PANEL_MIN_INSET_WIDTH)
  const [newPost, setNewPost] = useState<Post | null>(null)
  const [tab, setTab] = useState<FeedTab>("following")
  const selectedThread = useMemo(
    () => (postId && postHandle ? { id: postId, handle: postHandle } : null),
    [postId, postHandle]
  )
  const panelThread = useDelayedPresence(selectedThread, HOME_PANEL_PRESENCE_MS)

  const loadFeed = useCallback((cursor?: string) => api.feed(cursor), [])
  const loadPublic = useCallback(
    (cursor?: string) => api.publicTimeline(cursor),
    []
  )
  const openThread = useCallback(
    (post: Post) => {
      const handle = post.author.handle
      if (!handle) return
      if (isDesktop) {
        navigate({
          to: "/",
          search: { postId: post.id, postHandle: handle },
          replace: Boolean(selectedThread),
        })
        return
      }
      navigate({
        to: "/$handle/p/$id",
        params: { handle, id: post.id },
        search: homeThreadFromFeedSearch(post.id, handle),
      })
    },
    [isDesktop, navigate, selectedThread]
  )
  const closeThread = useCallback(() => {
    navigate({ to: "/", search: {}, replace: true })
  }, [navigate])

  useEffect(() => {
    if (isDesktop || !selectedThread) return
    navigate({
      to: "/$handle/p/$id",
      params: { handle: selectedThread.handle, id: selectedThread.id },
      search: homeThreadFromFeedSearch(
        selectedThread.id,
        selectedThread.handle
      ),
      replace: true,
    })
  }, [isDesktop, navigate, selectedThread])

  if (isPending) {
    return (
      <PageFrame>
        <main className="px-4 py-8" />
      </PageFrame>
    )
  }

  if (session) {
    const needsHandle = me && !me.handle
    return (
      <main className="@min-[1120px]/inset:flex @min-[1120px]/inset:justify-center @min-[1120px]/inset:overflow-x-clip">
        <div className="@min-[1120px]/inset:flex @min-[1120px]/inset:min-h-[calc(100vh-3rem)] @min-[1120px]/inset:w-[1120px] @min-[1120px]/inset:items-start">
          <div
            className={`mx-auto w-full min-w-0 border-border md:max-w-[640px] md:border-x @min-[1120px]/inset:mx-0 @min-[1120px]/inset:max-w-none @min-[1120px]/inset:w-[640px] @min-[1120px]/inset:shrink-0 @min-[1120px]/inset:border-x @min-[1120px]/inset:border-border @min-[1120px]/inset:transition-transform @min-[1120px]/inset:duration-300 @min-[1120px]/inset:ease-out @min-[1120px]/inset:[will-change:transform] @min-[1120px]/inset:[contain:layout] ${
              panelThread
                ? "@min-[1120px]/inset:translate-x-0"
                : "@min-[1120px]/inset:translate-x-[240px]"
            }`}
          >
            {needsHandle ? (
              <div className="m-4 rounded-md border border-primary/40 bg-primary/5 p-4">
                <h2 className="text-sm font-semibold">
                  Finish setting up your account
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a handle so people can find you. This is permanent for
                  v1.
                </p>
                <Link to="/settings" className="mt-3 inline-block">
                  <Button size="sm">Claim your handle</Button>
                </Link>
              </div>
            ) : (
              <Compose onCreated={(p) => setNewPost(p)} collapsible />
            )}
            <div className="flex border-b border-border">
              {(["following", "all"] as Array<FeedTab>).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                    tab === t
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "following" ? "Following" : "All"}
                </button>
              ))}
            </div>
            <Feed
              key={tab}
              load={tab === "following" ? loadFeed : loadPublic}
              emptyMessage={
                tab === "following"
                  ? "Follow people to see posts here. Switch to All to see the public timeline."
                  : "No posts yet. Be the first."
              }
              prependItem={newPost}
              onOpenThread={openThread}
              activePostId={panelThread?.id}
            />
          </div>

          <div className="hidden @min-[1120px]/inset:block @min-[1120px]/inset:w-[480px] @min-[1120px]/inset:shrink-0 @min-[1120px]/inset:[contain:layout]">
            {panelThread && (
              <div
                className={`sticky top-0 h-[calc(100vh-3rem)] overflow-hidden border-l border-border bg-background transition-transform duration-300 ease-out [will-change:transform] ${
                  selectedThread
                    ? "translate-x-0"
                    : "pointer-events-none translate-x-full"
                }`}
              >
                <ThreadViewContent
                  handle={panelThread.handle}
                  id={panelThread.id}
                  mode="panel"
                  onClose={closeThread}
                  returnToHome={{
                    postId: panelThread.id,
                    postHandle: panelThread.handle,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <PageFrame>
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Open-source. Free for everyone. No AI.
        </h1>
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          {APP_NAME} is a developer-native social platform. Post, write
          articles, DM, and connect your GitHub or GitLab — without paywalls,
          trackers, or black-box rankers.
        </p>
        <div className="mt-8 flex gap-2">
          <Link to="/signup">
            <Button size="lg">Create an account</Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
        <ul className="mt-10 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <li className="rounded-md border border-border p-3">
            <p className="font-medium">Posts + articles</p>
            <p className="text-muted-foreground">
              500 chars for posts, long-form for articles.
            </p>
          </li>
          <li className="rounded-md border border-border p-3">
            <p className="font-medium">Dev integrations</p>
            <p className="text-muted-foreground">
              Pin repos. Embed commits and PRs. GitHub, GitLab, Linear.
            </p>
          </li>
          <li className="rounded-md border border-border p-3">
            <p className="font-medium">Free analytics</p>
            <p className="text-muted-foreground">
              Creator dashboard, no paywall, no inference.
            </p>
          </li>
          <li className="rounded-md border border-border p-3">
            <p className="font-medium">Own your data</p>
            <p className="text-muted-foreground">
              Full export, self-hostable under AGPL-3.0.
            </p>
          </li>
        </ul>
      </main>
    </PageFrame>
  )
}
