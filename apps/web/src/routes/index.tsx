import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { useMe } from "../lib/me"
import { Compose } from "../components/compose"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import { PageLoading } from "../components/page-surface"
import type { Post } from "../lib/api"

const FEED_TABS = ["following", "network", "all"] as const
type FeedTab = (typeof FEED_TABS)[number]

const TAB_LABELS: Record<FeedTab, string> = {
  following: "Following",
  network: "Network",
  all: "All",
}

export const Route = createFileRoute("/")({
  component: Landing,
  validateSearch: (search: Record<string, unknown>): { tab?: FeedTab } => {
    const raw = search.tab
    if (typeof raw === "string" && FEED_TABS.includes(raw as FeedTab)) {
      return { tab: raw as FeedTab }
    }
    return {}
  },
})

function Landing() {
  const { data: session, isPending } = authClient.useSession()
  const { me } = useMe()
  const navigate = useNavigate()
  const { tab: searchTab } = Route.useSearch()
  const tab: FeedTab = searchTab ?? "following"
  const [newPost, setNewPost] = useState<Post | null>(null)

  const loadFeed = useCallback((cursor?: string) => api.feed(cursor), [])
  const loadPublic = useCallback(
    (cursor?: string) => api.publicTimeline(cursor),
    []
  )
  const loadNetwork = useCallback(
    (cursor?: string) => api.networkFeed(cursor),
    []
  )

  if (isPending) {
    return (
      <PageFrame>
        <PageLoading />
      </PageFrame>
    )
  }

  if (session) {
    const needsHandle = me && !me.handle
    return (
      <PageFrame>
        <header className="sticky top-0 z-40 flex h-12 items-center bg-base-1/80 px-4 backdrop-blur-md">
          <SegmentedControl
            layout="fit"
            variant="ghost"
            value={tab}
            options={FEED_TABS.map((key) => ({
              value: key,
              label: TAB_LABELS[key],
            }))}
            onValueChange={(value) => {
              void navigate({
                to: "/",
                search: value === "following" ? undefined : { tab: value },
              })
            }}
          />
        </header>
        {needsHandle ? (
          <Alert className="m-4">
            <AlertTitle>Finish setup</AlertTitle>
            <AlertDescription>
              Choose a handle so others can find you. Handles are permanent in
              v1.
            </AlertDescription>
            <div className="mt-3">
              <Button
                size="sm"
                nativeButton={false}
                render={<Link to="/settings" />}
              >
                Claim your handle
              </Button>
            </div>
          </Alert>
        ) : (
          <Compose onCreated={(p) => setNewPost(p)} collapsible />
        )}
        <Feed
          queryKey={["feed", tab]}
          load={
            tab === "following"
              ? loadFeed
              : tab === "network"
                ? loadNetwork
                : loadPublic
          }
          emptyMessage={
            tab === "following"
              ? "Follow people to see posts here. Switch to All to see the public timeline."
              : tab === "network"
                ? "No posts from your network's likes/reposts yet."
                : "No posts yet. Be the first."
          }
          prependItem={newPost}
          renderActivityBanner={
            tab === "network"
              ? (p) => {
                  const np = p as Post & {
                    networkActors?: Array<{
                      id: string
                      handle: string | null
                      displayName: string | null
                    }>
                    networkActorTotal?: number
                  }
                  if (!np.networkActors || np.networkActors.length === 0)
                    return null
                  const first = np.networkActors[0]
                  const more = (np.networkActorTotal ?? 1) - 1
                  const name =
                    first.displayName ||
                    (first.handle ? `@${first.handle}` : "Someone")
                  return (
                    <div className="ml-10 flex items-center gap-1.5 text-xs text-tertiary">
                      <span>
                        {name}
                        {more > 0
                          ? ` and ${more} other${more === 1 ? "" : "s"}`
                          : ""}{" "}
                        liked or reposted
                      </span>
                    </div>
                  )
                }
              : undefined
          }
        />
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <main className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          A calm place to build in public
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-secondary">
          {APP_NAME} is a social layer for developers: short posts, articles,
          DMs, and repo context. No paywalls, no ads, no black-box feeds.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="md" nativeButton={false} render={<Link to="/signup" />}>
            Create an account
          </Button>
          <Button
            size="md"
            variant="outline"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            Sign in
          </Button>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">Posts and articles</span>
              <span className="text-xs text-tertiary">
                Short updates and long-form writing in one place.
              </span>
            </Card.Header>
          </Card>
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">Developer context</span>
              <span className="text-xs text-tertiary">
                Connect GitHub, GitLab, and tools you already use.
              </span>
            </Card.Header>
          </Card>
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">Simple analytics</span>
              <span className="text-xs text-tertiary">
                A creator dashboard without upsells or model-driven ranking.
              </span>
            </Card.Header>
          </Card>
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">Your data</span>
              <span className="text-xs text-tertiary">
                Export and self-host with AGPL-3.0.
              </span>
            </Card.Header>
          </Card>
        </div>
      </main>
    </PageFrame>
  )
}
