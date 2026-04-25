import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "../lib/auth"
import { api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { useMe } from "../lib/me"
import { Compose } from "../components/compose"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import type { Post } from "../lib/api"

export const Route = createFileRoute("/")({ component: Landing })

type FeedTab = "following" | "all"

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
      <PageFrame>
        <main className="">
        {needsHandle ? (
          <div className="m-4 rounded-md border border-primary/40 bg-primary/5 p-4">
            <h2 className="text-sm font-semibold">
              Finish setting up your account
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a handle so people can find you. This is permanent for v1.
            </p>
            <Link to="/settings" className="mt-3 inline-block">
              <Button size="sm">Claim your handle</Button>
            </Link>
          </div>
        ) : (
          <Compose onCreated={(p) => setNewPost(p)} />
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
        {tab === "following" ? (
          <Feed
            load={loadFeed}
            emptyMessage="Follow people to see posts here. Switch to All to see the public timeline."
            prependItem={newPost}
          />
        ) : (
          <Feed
            load={loadPublic}
            emptyMessage="No posts yet. Be the first."
            prependItem={newPost}
          />
        )}
        </main>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Open-source. Free for everyone. No AI.
      </h1>
      <p className="mt-4 max-w-prose text-sm text-muted-foreground">
        {APP_NAME} is a developer-native social platform. Post, write articles,
        DM, and connect your GitHub or GitLab — without paywalls, trackers, or
        black-box rankers.
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
