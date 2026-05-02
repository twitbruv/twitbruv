import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import {
  IdentificationIcon,
  PencilSquareIcon,
  SparklesIcon,
  UserPlusIcon,
} from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { cn } from "@workspace/ui/lib/utils"
import { authClient } from "../lib/auth"
import { checkSessionCookie } from "../lib/auth-fns"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { useMe } from "../lib/me"
import { Compose } from "../components/compose"
import {
  useCompose,
  useOnModalPostCreated,
} from "../components/compose-provider"
import { Feed } from "../components/feed"
import { Loader, useLoaderVisible } from "../components/loader"
import { PageEmpty } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { useSettings } from "../components/settings/settings-provider"
import { isSettingsTab } from "../components/settings/types"
import type { FeedTabKey } from "../lib/query-keys"
import type { InfiniteData } from "@tanstack/react-query"
import type { FeedPage, Post } from "../lib/api"

const FEED_TABS = ["following", "network", "all"] as const
type FeedTab = (typeof FEED_TABS)[number]

const TAB_LABELS: Record<FeedTab, string> = {
  following: "Following",
  network: "Network",
  all: "All",
}

type HomeSearch = {
  tab?: FeedTab
  settings_tab?: string
  connected?: string
  connect_error?: string
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const raw = search.tab
    const feedTab =
      typeof raw === "string" && FEED_TABS.includes(raw as FeedTab)
        ? (raw as FeedTab)
        : undefined
    const settingsRaw = search.settings_tab
    const settings_tab =
      typeof settingsRaw === "string" ? settingsRaw : undefined
    const connected =
      typeof search.connected === "string" ? search.connected : undefined
    const connect_error =
      typeof search.connect_error === "string"
        ? search.connect_error
        : undefined
    const out: HomeSearch = {}
    if (feedTab) out.tab = feedTab
    if (settings_tab) out.settings_tab = settings_tab
    if (connected) out.connected = connected
    if (connect_error) out.connect_error = connect_error
    return out
  },
  beforeLoad: async () => {
    const { hasSessionCookie } = await checkSessionCookie()
    if (!hasSessionCookie) throw redirect({ to: "/welcome" })
  },
  component: Home,
})

function Home() {
  const { isPending } = authClient.useSession()
  const { me } = useMe()
  const { open: openCompose } = useCompose()
  const {
    tab: searchTab,
    settings_tab,
    connected,
    connect_error,
  } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { open: openSettings } = useSettings()
  const tab: FeedTab = searchTab ?? "following"
  const queryClient = useQueryClient()
  /** If React Query already has this tab's feed (return navigation / prefetch), skip the route-level loader. */
  const [feedReady, setFeedReady] = useState(() =>
    Boolean(queryClient.getQueryData(qk.feed(tab)))
  )
  const [newPost, setNewPost] = useState<Post | null>(null)

  useOnModalPostCreated(
    useCallback((post: Post) => {
      setNewPost(post)
    }, [])
  )

  useEffect(() => {
    if (!settings_tab || !isSettingsTab(settings_tab)) return
    openSettings({
      tab: settings_tab,
      focusProfile: settings_tab === "profile",
      githubOAuth:
        settings_tab === "connections"
          ? {
              connected,
              connectError: connect_error,
            }
          : undefined,
    })
    navigate({
      to: "/",
      search: { tab: tab === "following" ? undefined : tab },
      replace: true,
    })
  }, [settings_tab, connect_error, connected, navigate, openSettings, tab])

  const loadFeed = useCallback((cursor?: string) => api.feed(cursor), [])
  const loadPublic = useCallback(
    (cursor?: string) => api.publicTimeline(cursor),
    []
  )
  const loadNetwork = useCallback(
    (cursor?: string) => api.networkFeed(cursor),
    []
  )

  const needsHandle = me && !me.handle

  useEffect(() => {
    if (queryClient.getQueryData(qk.feed(tab))) {
      setFeedReady(true)
    }
  }, [queryClient, tab])

  useEffect(() => {
    if (needsHandle) return
    for (const t of FEED_TABS) {
      if (t === tab) continue
      const load =
        t === "following"
          ? loadFeed
          : t === "network"
            ? loadNetwork
            : loadPublic
      void queryClient.prefetchInfiniteQuery<
        FeedPage,
        Error,
        InfiniteData<FeedPage, string | undefined>,
        readonly ["feed", FeedTabKey],
        string | undefined
      >({
        queryKey: qk.feed(t),
        queryFn: ({ pageParam }) => load(pageParam),
        initialPageParam: undefined,
        getNextPageParam: (last: FeedPage) => last.nextCursor ?? undefined,
      })
    }
  }, [needsHandle, queryClient, tab, loadFeed, loadNetwork, loadPublic])

  const showLoader = useLoaderVisible(isPending || (!needsHandle && !feedReady))

  const emptyState =
    tab === "following" ? (
      <PageEmpty
        icon={<UserPlusIcon />}
        title="Build your timeline"
        description="Follow people to see their posts here. Try the public timeline to find someone interesting."
        actions={
          <>
            <Button
              size="sm"
              variant="primary"
              nativeButton={false}
              render={<Link to="/search" />}
            >
              Find people
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link to="/" search={{ tab: "all" }} />}
            >
              View public timeline
            </Button>
          </>
        }
      />
    ) : tab === "network" ? (
      <PageEmpty
        icon={<SparklesIcon />}
        title="Your network is quiet"
        description="Posts liked or reposted by people you follow will surface here. Until then, browse the public timeline."
        actions={
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/" search={{ tab: "all" }} />}
          >
            View public timeline
          </Button>
        }
      />
    ) : (
      <PageEmpty
        icon={<PencilSquareIcon />}
        title="Be the first to post"
        description="Nothing here yet. Share something to get the conversation started."
        actions={
          <Button size="sm" variant="primary" onClick={() => openCompose()}>
            Write a post
          </Button>
        }
      />
    )

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
        <PageEmpty
          icon={<IdentificationIcon />}
          title="Finish setting up your account"
          description="Pick a handle so others can find and mention you. Handles are permanent in v1, so choose wisely."
          actions={
            <Button
              size="sm"
              variant="primary"
              onClick={() => openSettings({ tab: "profile" })}
            >
              Claim your handle
            </Button>
          }
          className="px-4"
        />
      ) : (
        <Compose onCreated={(p) => setNewPost(p)} collapsible />
      )}
      {showLoader && (
        <div className="flex items-center justify-center py-16">
          <Loader
            autoplay
            className="h-16 text-primary/40"
            label="Hang on..."
          />
        </div>
      )}
      {!needsHandle && (
        <div
          className={cn(
            "transition-opacity duration-200",
            showLoader && "pointer-events-none opacity-0"
          )}
        >
          <Feed
            queryKey={qk.feed(tab)}
            load={
              tab === "following"
                ? loadFeed
                : tab === "network"
                  ? loadNetwork
                  : loadPublic
            }
            emptyState={emptyState}
            prependItem={newPost}
            quietPending={!feedReady}
            onReady={() => setFeedReady(true)}
            chainPreview={tab === "following" || tab === "all"}
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
                      <div className="pb-1 text-xs text-tertiary">
                        {name}
                        {more > 0
                          ? ` and ${more} other${more === 1 ? "" : "s"}`
                          : ""}{" "}
                        liked or reposted
                      </div>
                    )
                  }
                : undefined
            }
          />
        </div>
      )}
    </PageFrame>
  )
}
