import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useCallback, useState } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { authClient } from "../lib/auth"
import { checkSessionCookie } from "../lib/auth-fns"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { useMe } from "../lib/me"
import { Compose } from "../components/compose"
import { useOnModalPostCreated } from "../components/compose-provider"
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
  beforeLoad: async () => {
    const { hasSessionCookie } = await checkSessionCookie()
    if (!hasSessionCookie) throw redirect({ to: "/welcome" })
  },
  component: Home,
  validateSearch: (search: Record<string, unknown>): { tab?: FeedTab } => {
    const raw = search.tab
    if (typeof raw === "string" && FEED_TABS.includes(raw as FeedTab)) {
      return { tab: raw as FeedTab }
    }
    return {}
  },
})

function Home() {
  const { isPending } = authClient.useSession()
  const { me } = useMe()
  const navigate = useNavigate()
  const { tab: searchTab } = Route.useSearch()
  const tab: FeedTab = searchTab ?? "following"
  const [newPost, setNewPost] = useState<Post | null>(null)

  // Prepend posts created from the modal composer (e.g. quote posts)
  useOnModalPostCreated(
    useCallback((post: Post) => {
      setNewPost(post)
    }, []),
  )

  const loadFeed = useCallback((cursor?: string) => api.feed(cursor), [])
  const loadPublic = useCallback(
    (cursor?: string) => api.publicTimeline(cursor),
    [],
  )
  const loadNetwork = useCallback(
    (cursor?: string) => api.networkFeed(cursor),
    [],
  )

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
      {isPending ? (
        <PageLoading />
      ) : (
        <Feed
          queryKey={qk.feed(tab)}
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
      )}
    </PageFrame>
  )
}
