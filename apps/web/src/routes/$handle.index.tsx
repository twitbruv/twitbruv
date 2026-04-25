import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { Feed } from "../components/feed"
import { ProfileActions } from "../components/profile-actions"
import { ImageLightbox } from "../components/image-lightbox"
import { RichText } from "../components/rich-text"
import { VerifiedBadge } from "../components/verified-badge"
import { useMe } from "../lib/me"
import { APP_NAME, WEB_URL } from "../lib/env"
import { buildSeoMeta, canonicalLink, clipDescription } from "../lib/seo"
import type { PublicProfile, UserList } from "../lib/api"

export const Route = createFileRoute("/$handle/")({
  component: Profile,
  loader: async ({ params }) => {
    try {
      const { user } = await api.user(params.handle)
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
  const [user, setUser] = useState<PublicProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUser(null)
    setError(null)
    api
      .user(handle)
      .then(({ user }) => setUser(user))
      .catch((e) => setError(e instanceof ApiError ? e.message : "not found"))
  }, [handle])

  const load = useCallback(
    (cursor?: string) => api.userPosts(handle, cursor),
    [handle]
  )

  if (error) {
    return (
      <main className="px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">user not found</p>
      </main>
    )
  }
  if (!user) {
    return (
      <main className="px-4 py-16">
        <p className="text-sm text-muted-foreground">loading…</p>
      </main>
    )
  }

  const displayName = user.displayName || `@${user.handle}`
  const initial = (user.displayName ?? user.handle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  return (
    <main>
      <ImageLightbox
        images={user.bannerUrl ? [{ src: user.bannerUrl }] : []}
        title={`${displayName}'s banner`}
        disabled={!user.bannerUrl}
        className="block w-full"
      >
        <div className="h-44 w-full bg-muted">
          {user.bannerUrl && (
            <img
              src={user.bannerUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
      </ImageLightbox>
      <div className="px-4 pb-4">
        <div className="-mt-12 flex items-end justify-between gap-4">
          <ImageLightbox
            images={user.avatarUrl ? [{ src: user.avatarUrl }] : []}
            title={`${displayName}'s avatar`}
            disabled={!user.avatarUrl}
          >
            <div className="size-24 overflow-hidden rounded-full ring-4 ring-background">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-3xl font-semibold text-foreground/80 uppercase">
                  {initial}
                </div>
              )}
            </div>
          </ImageLightbox>
          <div className="pb-1">
            {me?.id === user.id ? (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link to="/settings" hash="profile" />}
              >
                Edit profile
              </Button>
            ) : (
              <ProfileActions profile={user} onChange={setUser} />
            )}
          </div>
        </div>
        <div className="mt-3">
          <h1 className="flex items-center gap-1.5 text-xl font-semibold">
            {displayName}
            {user.isVerified && <VerifiedBadge size={20} role={user.role} />}
          </h1>
          <p className="text-sm text-muted-foreground">@{user.handle}</p>
        </div>
        {user.bio && (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
            <RichText text={user.bio} />
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          {user.location && <span>{user.location}</span>}
          {user.websiteUrl && (
            <a
              href={user.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {user.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
          <span>joined {new Date(user.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="mt-3 flex items-center gap-5 text-xs">
          {user.handle && (
            <>
              <Link
                to="/$handle/following"
                params={{ handle: user.handle }}
                className="hover:underline"
              >
                <span className="font-semibold">{user.counts.following}</span>{" "}
                <span className="text-muted-foreground">following</span>
              </Link>
              <Link
                to="/$handle/followers"
                params={{ handle: user.handle }}
                className="hover:underline"
              >
                <span className="font-semibold">{user.counts.followers}</span>{" "}
                <span className="text-muted-foreground">followers</span>
              </Link>
            </>
          )}
          <span>
            <span className="font-semibold">{user.counts.posts}</span>{" "}
            <span className="text-muted-foreground">posts</span>
          </span>
        </div>
      </div>
      {user.handle && <ProfileLists handle={user.handle} />}
      <div className="border-t border-border">
        <Feed
          queryKey={["userPosts", handle]}
          load={load}
          emptyMessage={`@${user.handle} hasn't posted yet.`}
        />
      </div>
    </main>
  )
}

function ProfileLists({ handle }: { handle: string }) {
  const [pinned, setPinned] = useState<Array<UserList> | null>(null)
  const [listedOn, setListedOn] = useState<Array<UserList> | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .userLists(handle)
      .then(({ lists }) => {
        if (cancelled) return
        setPinned(lists.filter((l) => l.pinnedAt))
      })
      .catch(() => {
        if (!cancelled) setPinned([])
      })
    api
      .listsListedOn(handle)
      .then(({ lists }) => {
        if (!cancelled) setListedOn(lists.slice(0, 10))
      })
      .catch(() => {
        if (!cancelled) setListedOn([])
      })
    return () => {
      cancelled = true
    }
  }, [handle])

  if ((pinned === null || pinned.length === 0) && (listedOn === null || listedOn.length === 0)) {
    return null
  }
  return (
    <div className="border-t border-border px-4 py-3 text-xs">
      {pinned && pinned.length > 0 && (
        <div className="mb-2">
          <h2 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Pinned lists
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {pinned.map((l) => (
              <Link
                key={l.id}
                to="/lists/$id"
                params={{ id: l.id }}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 hover:bg-muted"
              >
                {l.title}
                <span className="ml-1.5 text-muted-foreground">{l.memberCount}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {listedOn && listedOn.length > 0 && (
        <div>
          <h2 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Lists @{handle} is on
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {listedOn.map((l) => (
              <Link
                key={l.id}
                to="/lists/$id"
                params={{ id: l.id }}
                className="rounded-full border border-border px-2.5 py-1 hover:bg-muted/40"
              >
                {l.title}
                {l.ownerHandle && (
                  <span className="ml-1.5 text-muted-foreground">@{l.ownerHandle}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
