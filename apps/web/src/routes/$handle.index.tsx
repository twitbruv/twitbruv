import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarIcon, LinkIcon, MapPinIcon } from "@heroicons/react/24/outline"
import { Avatar } from "@workspace/ui/components/avatar"
import { PencilSquareIcon } from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { Feed } from "../components/feed"
import { ProfileActions } from "../components/profile-actions"
import { ImageLightbox } from "../components/image-lightbox"
import { RichText } from "../components/rich-text"
import { GithubBlock } from "../components/github-block"
import { MetaPill } from "../components/meta-pill"
import { VerifiedBadge, resolveBadgeTier } from "../components/verified-badge"
import {
  NotFoundPanel,
  PageEmpty,
  PageLoading,
} from "../components/page-surface"
import { useMe } from "../lib/me"
import { qk } from "../lib/query-keys"
import { APP_NAME, WEB_URL } from "../lib/env"
import { buildSeoMeta, canonicalLink, clipDescription } from "../lib/seo"
import { useSettings } from "../components/settings/settings-provider"
import type { UserList } from "../lib/api"

export const Route = createFileRoute("/$handle/")({
  component: Profile,
  loader: async ({ params, context }) => {
    const ctx = context
    try {
      const { user } = await api.user(params.handle)
      ctx.queryClient.setQueryData(qk.user(params.handle), user)
      await ctx.queryClient.prefetchQuery({
        queryKey: qk.userLists(params.handle),
        queryFn: async () => (await api.userLists(params.handle)).lists,
      })
      await ctx.queryClient.prefetchQuery({
        queryKey: qk.listsListedOn(params.handle),
        queryFn: async () => (await api.listsListedOn(params.handle)).lists,
      })
      return { user }
    } catch {
      return { user: null }
    }
  },
  head: ({ loaderData, params }) => {
    const user = loaderData?.user ?? null
    const path = `/${params.handle}`
    if (!user) {
      return {
        meta: buildSeoMeta({
          title: `@${params.handle} not found`,
          description: `No ${APP_NAME} profile exists for @${params.handle}.`,
          path,
        }),
        links: [canonicalLink(path)],
      }
    }
    const name = user.displayName || `@${user.handle}`
    const description = clipDescription(
      user.bio ||
        `@${user.handle} on ${APP_NAME} — ${user.counts.followers} followers, ${user.counts.posts} posts.`
    )
    return {
      meta: buildSeoMeta({
        title: `${name} (@${user.handle})`,
        description,
        path,
        image: user.bannerUrl ?? `/og/user/${user.handle}`,
        type: "profile",
        largeCard: true,
      }),
      links: [canonicalLink(path)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              name,
              alternateName: `@${user.handle}`,
              description: user.bio ?? undefined,
              image: user.avatarUrl ?? undefined,
              url: `${WEB_URL}${path}`,
              identifier: user.handle ?? undefined,
            },
          }),
        },
      ],
    }
  },
})

function Profile() {
  const { handle } = Route.useParams()
  const { me } = useMe()
  const { open: openSettings } = useSettings()
  const qc = useQueryClient()

  const {
    data: user,
    error,
    isPending,
  } = useQuery({
    queryKey: qk.user(handle),
    queryFn: async () => (await api.user(handle)).user,
    retry: false,
  })

  const load = useCallback(
    (cursor?: string) => api.userPosts(handle, cursor),
    [handle]
  )

  const profileError =
    error instanceof ApiError ? error.message : error ? "not found" : null

  if (profileError) {
    return (
      <NotFoundPanel
        title="User not found"
        message={`We couldn't find @${handle}. The handle may have changed or the account no longer exists.`}
      />
    )
  }
  if (isPending || !user) {
    return (
      <div className="px-4 py-12">
        <PageLoading />
      </div>
    )
  }

  const displayName = user.displayName || `@${user.handle}`
  const initial = (user.displayName ?? user.handle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  return (
    <section className="relative w-full">
      <ImageLightbox
        images={user.bannerUrl ? [{ src: user.bannerUrl }] : []}
        title={`${displayName}'s banner`}
        disabled={!user.bannerUrl}
        className="block w-full rounded-b-2xl"
      >
        <div className="bg-muted h-52 w-full rounded-b-2xl shadow-banner">
          {user.bannerUrl && (
            <img
              src={user.bannerUrl}
              alt=""
              className="h-full w-full rounded-b-2xl object-cover"
            />
          )}
        </div>
      </ImageLightbox>
      <div className="">
        <div className="bg-card/75 dark:bg-card/35 relative z-1 -mt-8 rounded-2xl p-5">
          <div className="-mt-16 flex items-end justify-between gap-4">
            <ImageLightbox
              images={user.avatarUrl ? [{ src: user.avatarUrl }] : []}
              title={`${displayName}'s avatar`}
              disabled={!user.avatarUrl}
            >
              <div className="rounded-full bg-base-1 p-1">
                <Avatar
                  initial={initial}
                  src={user.avatarUrl}
                  size="xl"
                  className="size-28"
                />
              </div>
            </ImageLightbox>
            {me?.id === user.id ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  openSettings({ tab: "profile", focusProfile: true })
                }
              >
                Edit profile
              </Button>
            ) : (
              <ProfileActions
                profile={user}
                onChange={(next) => qc.setQueryData(qk.user(handle), next)}
              />
            )}
          </div>
          <div className="mt-1">
            <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight">
              {displayName}
              {(() => {
                const tier = resolveBadgeTier(user)
                return tier ? <VerifiedBadge size={22} role={tier} /> : null
              })()}
            </h1>
            <p className="text-sm text-secondary">@{user.handle}</p>
          </div>
          {user.bio && (
            <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">
              <RichText text={user.bio} />
            </p>
          )}
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]">
            {user.location && (
              <MetaPill
                icon={
                  <MapPinIcon
                    strokeWidth={2}
                    className="mt-px size-3.5 shrink-0"
                    aria-hidden
                  />
                }
              >
                {user.location}
              </MetaPill>
            )}
            {user.websiteUrl && (
              <MetaPill
                href={user.websiteUrl}
                icon={
                  <LinkIcon
                    strokeWidth={2}
                    className="size-3.5 shrink-0"
                    aria-hidden
                  />
                }
              >
                {user.websiteUrl.replace(/^https?:\/\//, "")}
              </MetaPill>
            )}
            <MetaPill
              icon={
                <CalendarIcon
                  strokeWidth={2}
                  className="size-3.5 shrink-0"
                  aria-hidden
                />
              }
            >
              Joined{" "}
              {new Intl.DateTimeFormat(undefined, {
                month: "long",
                year: "numeric",
              }).format(new Date(user.createdAt))}
            </MetaPill>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 px-2.5">
            {user.handle && (
              <>
                <Link
                  to="/$handle/following"
                  params={{ handle: user.handle }}
                  className="bg-muted/45 hover:bg-muted/75 text-foreground rounded-full py-1.5 text-sm no-underline transition-colors"
                >
                  <span className="font-semibold tabular-nums">
                    {user.counts.following}
                  </span>{" "}
                  <span className="text-muted-foreground">following</span>
                </Link>
                <Link
                  to="/$handle/followers"
                  params={{ handle: user.handle }}
                  className="bg-muted/45 hover:bg-muted/75 text-foreground rounded-full py-1.5 text-sm no-underline transition-colors"
                >
                  <span className="font-semibold tabular-nums">
                    {user.counts.followers}
                  </span>{" "}
                  <span className="text-muted-foreground">followers</span>
                </Link>
              </>
            )}
            <span className="bg-muted/45 text-foreground rounded-full py-1.5 text-sm">
              <span className="font-semibold tabular-nums">
                {user.counts.posts}
              </span>{" "}
              <span className="text-muted-foreground">posts</span>
            </span>
          </div>
        </div>
      </div>
      {user.handle && <GithubBlock handle={user.handle} />}
      {user.handle && <ProfileLists handle={user.handle} />}
      <div className="mt-1.5">
        <Feed
          queryKey={qk.userPosts(handle)}
          load={load}
          emptyState={
            <PageEmpty
              icon={<PencilSquareIcon />}
              title={`@${user.handle} hasn't posted yet`}
              description="Check back later, or follow them so their first post lands in your feed."
            />
          }
        />
      </div>
    </section>
  )
}

function ProfileLists({ handle }: { handle: string }) {
  const { data: myLists } = useQuery({
    queryKey: qk.userLists(handle),
    queryFn: async () => (await api.userLists(handle)).lists,
  })
  const { data: listedFull } = useQuery({
    queryKey: qk.listsListedOn(handle),
    queryFn: async () => (await api.listsListedOn(handle)).lists,
  })

  const pinned = useMemo(
    () => (myLists ?? []).filter((l: UserList) => l.pinnedAt),
    [myLists]
  )
  const listedOn = useMemo(() => (listedFull ?? []).slice(0, 10), [listedFull])

  if (pinned.length === 0 && listedOn.length === 0) {
    return null
  }
  return (
    <div className="px-4 py-3 text-xs">
      {pinned.length > 0 && (
        <div className="mb-2">
          <h2 className="text-muted-foreground mb-1.5 text-xs font-medium">
            Pinned lists
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {pinned.map((l) => (
              <Link
                key={l.id}
                to="/lists/$id"
                params={{ id: l.id }}
                className="border-border bg-muted/40 hover:bg-muted rounded-full border px-2.5 py-1"
              >
                {l.title}
                <span className="text-muted-foreground ml-1.5 tabular-nums">
                  {l.memberCount}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {listedOn.length > 0 && (
        <div>
          <h2 className="text-muted-foreground mb-1.5 text-xs font-medium">
            Lists @{handle} is on
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {listedOn.map((l) => (
              <Link
                key={l.id}
                to="/lists/$id"
                params={{ id: l.id }}
                className="border-border hover:bg-muted/40 rounded-full border px-2.5 py-1"
              >
                {l.title}
                {l.ownerHandle && (
                  <span className="text-muted-foreground ml-1.5">
                    @{l.ownerHandle}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
