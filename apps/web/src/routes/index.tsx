import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { useMe } from "../lib/me"
import { Compose } from "../components/compose"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import { PageLoading } from "../components/page-surface"
import {
  UnderlineTabButton,
  UnderlineTabRow,
} from "../components/underline-tab-row"
import type { Post } from "../lib/api"

export const Route = createFileRoute("/")({
  component: Landing,
})

type FeedTab = "following" | "network" | "all"

function Landing() {
  const { data: session, isPending } = authClient.useSession()
  const { me } = useMe()
  const [newPost, setNewPost] = useState<Post | null>(null)
  const [tab, setTab] = useState<FeedTab>("following")

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
        <UnderlineTabRow>
          {(["following", "network", "all"] as Array<FeedTab>).map((t) => (
            <UnderlineTabButton
              key={t}
              active={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "following"
                ? "Following"
                : t === "network"
                  ? "Network"
                  : "All"}
            </UnderlineTabButton>
          ))}
        </UnderlineTabRow>
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
                    <div className="ml-10 flex items-center gap-1.5 text-xs text-muted-foreground">
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          A calm place to build in public
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {APP_NAME} is a social layer for developers: short posts, articles,
          DMs, and repo context. No paywalls, no ads, no black-box feeds.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="lg" nativeButton={false} render={<Link to="/signup" />}>
            Create an account
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            Sign in
          </Button>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Posts and articles</CardTitle>
              <CardDescription>
                Short updates and long-form writing in one place.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Developer context</CardTitle>
              <CardDescription>
                Connect GitHub, GitLab, and tools you already use.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Simple analytics</CardTitle>
              <CardDescription>
                A creator dashboard without upsells or model-driven ranking.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Your data</CardTitle>
              <CardDescription>
                Export and self-host with AGPL-3.0.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </PageFrame>
  )
}
