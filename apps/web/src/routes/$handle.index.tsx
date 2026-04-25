import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { ApiError,  api } from "../lib/api"
import { Feed } from "../components/feed"
import { ProfileActions } from "../components/profile-actions"
import { ImageLightbox } from "../components/image-lightbox"
import { RichText } from "../components/rich-text"
import { VerifiedBadge } from "../components/verified-badge"
import type {PublicProfile} from "../lib/api";

export const Route = createFileRoute("/$handle/")({ component: Profile })

function Profile() {
  const { handle } = Route.useParams()
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
            <ProfileActions profile={user} onChange={setUser} />
          </div>
        </div>
        <div className="mt-3">
          <h1 className="flex items-center gap-1.5 text-xl font-semibold">
            {displayName}
            {user.isVerified && <VerifiedBadge size={20} />}
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
      <div className="border-t border-border">
        <Feed load={load} emptyMessage={`@${user.handle} hasn't posted yet.`} />
      </div>
    </main>
  )
}
