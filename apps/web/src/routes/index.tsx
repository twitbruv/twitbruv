import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
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
import { ApiError, api } from "../lib/api"
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
import { ForYouAnnouncement } from "../components/for-you-announcement"
import type { InfiniteData } from "@tanstack/react-query"
import type { FeedPage, Post } from "../lib/api"

const ALL_TABS = ["forYou", "following", "network", "all"] as const
type FeedTab = (typeof ALL_TABS)[number]

const TAB_LABELS: Record<FeedTab, string> = {
  forYou: "For You",
  following: "Following",
  network: "Network",
  all: "All",
}

function isValidTab(value: unknown): value is FeedTab {
  return typeof value === "string" && ALL_TABS.includes(value as FeedTab)
}

type HomeSearch = {
  tab?: FeedTab
  settings_tab?: string
  connected?: string
  connect_error?: string
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const feedTab = isValidTab(search.tab) ? search.tab : undefined
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

function useVisibleTabs(forYouEnabled: boolean | undefined) {
  return useMemo<ReadonlyArray<FeedTab>>(
    () =>
      forYouEnabled === undefined
        ? ALL_TABS
        : forYouEnabled
          ? ["forYou", "following", "all"]
          : ["following", "network", "all"],
    [forYouEnabled]
  )
}

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

  const forYouEnabled = me?.experiments.forYouFeed
  const preferenceKnown = forYouEnabled !== undefined
  const visibleTabs = useVisibleTabs(forYouEnabled)
  const defaultTab: FeedTab =
    forYouEnabled === undefined
      ? "following"
      : forYouEnabled
        ? "forYou"
        : "following"
  const tab: FeedTab =
    searchTab && visibleTabs.includes(searchTab) ? searchTab : defaultTab

  const queryClient = useQueryClient()
  const [forYouRestartToken, setForYouRestartToken] = useState(0)
  const feedQueryKey = useMemo(
    () =>
      tab === "forYou" ? qk.feed("forYou", forYouRestartToken) : qk.feed(tab),
    [tab, forYouRestartToken]
  )
  const [feedReady, setFeedReady] = useState(() =>
    Boolean(queryClient.getQueryData(feedQueryKey))
  )
  const [newPost, setNewPost] = useState<Post | null>(null)
  const [forYouRetrying, setForYouRetrying] = useState(false)

  useOnModalPostCreated(
    useCallback((post: Post) => {
      setNewPost(post)
    }, [])
  )

  useEffect(() => {
    if (!preferenceKnown) return
    if (searchTab && !visibleTabs.includes(searchTab)) {
      void navigate({
        to: "/",
        search: undefined,
        replace: true,
      })
    }
  }, [preferenceKnown, searchTab, visibleTabs, defaultTab, navigate])

  useEffect(() => {
    if (!preferenceKnown) return
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
      search: tab === defaultTab ? undefined : { tab },
      replace: true,
    })
  }, [
    settings_tab,
    connect_error,
    connected,
    navigate,
    openSettings,
    tab,
    defaultTab,
    preferenceKnown,
  ])

  const loadFeed = useCallback((cursor?: string) => api.feed(cursor), [])
  const loadPublic = useCallback(
    (cursor?: string) => api.publicTimeline(cursor),
    []
  )
  const loadNetwork = useCallback(
    (cursor?: string) => api.networkFeed(cursor),
    []
  )
  const loadForYou = useCallback(
    async (cursor?: string): Promise<FeedPage> => {
      try {
        const page = await api.forYouFeed(cursor)
        return page
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          setForYouRetrying(true)
          setFeedReady(false)
          queryClient.removeQueries({ queryKey: qk.feed("forYou") })
          setForYouRestartToken((value) => value + 1)
        }
        throw err
      }
    },
    [queryClient]
  )
  const loadForYouPrefetch = useCallback(
    (cursor?: string): Promise<FeedPage> => api.forYouFeed(cursor),
    []
  )

  const needsHandle = me && !me.handle

  useEffect(() => {
    setFeedReady(Boolean(queryClient.getQueryData(feedQueryKey)))
    if (!queryClient.getQueryData(feedQueryKey)) setForYouRetrying(false)
  }, [feedQueryKey, queryClient])

  useEffect(() => {
    if (!preferenceKnown) return
    if (needsHandle) return
    for (const t of visibleTabs) {
      if (t === tab) continue
      const load =
        t === "following"
          ? loadFeed
          : t === "network"
            ? loadNetwork
            : t === "forYou"
              ? loadForYouPrefetch
              : loadPublic
      void queryClient.prefetchInfiniteQuery<
        FeedPage,
        Error,
        InfiniteData<FeedPage, string | undefined>,
        ReadonlyArray<unknown>,
        string | undefined
      >({
        queryKey: qk.feed(t, t === "forYou" ? forYouRestartToken : undefined),
        queryFn: ({ pageParam }) => load(pageParam),
        initialPageParam: undefined,
        getNextPageParam: (last: FeedPage) => last.nextCursor ?? undefined,
      })
    }
  }, [
    needsHandle,
    queryClient,
    tab,
    visibleTabs,
    loadFeed,
    loadNetwork,
    loadPublic,
    loadForYouPrefetch,
    preferenceKnown,
    forYouRestartToken,
  ])

  const showLoader = useLoaderVisible(
    isPending ||
      !preferenceKnown ||
      (!needsHandle && !feedReady) ||
      forYouRetrying
  )

  const emptyState =
    tab === "forYou" ? (
      <PageEmpty
        icon={<SparklesIcon />}
        title="Nothing yet"
        description="Your For You feed will populate as you follow people and engage with posts. Check out Following or All in the meantime."
        actions={
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/" search={{ tab: "following" }} />}
          >
            View Following
          </Button>
        }
      />
    ) : tab === "following" ? (
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

  const feedLoad =
    tab === "following"
      ? loadFeed
      : tab === "network"
        ? loadNetwork
        : tab === "forYou"
          ? loadForYou
          : loadPublic

  return (
    <PageFrame>
      <header className="sticky top-0 z-40 flex h-12 items-center bg-base-1/80 px-4 backdrop-blur-md">
        <SegmentedControl
          layout="fit"
          variant="ghost"
          value={tab}
          options={visibleTabs.map((key) => ({
            value: key,
            label: TAB_LABELS[key],
          }))}
          onValueChange={(value) => {
            void navigate({
              to: "/",
              search: value === defaultTab ? undefined : { tab: value },
            })
          }}
        />
      </header>
      {forYouEnabled === true && <ForYouAnnouncement />}
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
      {preferenceKnown && !needsHandle && (
        <div
          className={cn(
            "transition-opacity duration-200",
            showLoader && "pointer-events-none opacity-0"
          )}
        >
          <Feed
            queryKey={feedQueryKey}
            load={feedLoad}
            emptyState={emptyState}
            prependItem={tab === "forYou" ? null : newPost}
            quietPending={!feedReady}
            onReady={() => setFeedReady(true)}
            chainPreview={
              tab === "following" || tab === "all" || tab === "forYou"
            }
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
