import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  AtIcon,
  BookmarkIcon,
  ChartBarIcon,
  HashIcon,
  HeartIcon,
  ChatCircleIcon,
  ImageIcon,
  RepeatIcon,
} from "@phosphor-icons/react"
import { ApiError, api } from "../lib/api"
import { useSubmitHotkey } from "../lib/hotkeys"
import { Avatar } from "../components/avatar"
import { RichText } from "../components/rich-text"
import { MacfolioCardFromText } from "../components/macfolio-card"
import { PollBlock } from "../components/poll-block"
import { ArticleCardBlock, QuoteEmbed } from "../components/post-card"
import { ImageLightbox } from "../components/image-lightbox"
import { useMe } from "../lib/me"
import { APP_NAME } from "../lib/env"
import { buildSeoMeta, canonicalLink, clipDescription } from "../lib/seo"
import type { Post, Thread } from "../lib/api"

export const Route = createFileRoute("/$handle/p/$id")({
  component: ThreadView,
  loader: async ({ params }) => {
    try {
      const { post } = await api.post(params.id)
      return { post }
    } catch {
      return { post: null }
    }
  },
  head: ({ loaderData, params }) => {
    const post = loaderData?.post ?? null
    const path = `/${params.handle}/p/${params.id}`
    if (!post) {
      return {
        meta: buildSeoMeta({
          title: "Post not found",
          description: `This post on ${APP_NAME} either doesn't exist or has been removed.`,
          path,
        }),
        links: [canonicalLink(path)],
      }
    }
    const author = post.author.displayName || `@${post.author.handle ?? "user"}`
    const description = clipDescription(
      post.text || `A post by ${author} on ${APP_NAME}.`
    )
    return {
      meta: buildSeoMeta({
        title: `${author}: "${clipDescription(post.text, 60)}"`,
        description,
        path,
        image: `/og/post/${post.id}`,
        type: "article",
        largeCard: true,
        publishedTime: post.createdAt,
        authorHandle: post.author.handle ?? undefined,
      }),
      links: [canonicalLink(path)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SocialMediaPosting",
            headline: clipDescription(post.text, 110),
            articleBody: post.text,
            datePublished: post.createdAt,
            dateModified: post.editedAt ?? post.createdAt,
            url: `${path}`,
            author: post.author.handle
              ? {
                  "@type": "Person",
                  name: post.author.displayName ?? post.author.handle,
                  url: `/${post.author.handle}`,
                }
              : undefined,
            interactionStatistic: [
              {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/LikeAction",
                userInteractionCount: post.counts.likes,
              },
              {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/ShareAction",
                userInteractionCount: post.counts.reposts,
              },
              {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/CommentAction",
                userInteractionCount: post.counts.replies,
              },
            ],
          }),
        },
      ],
    }
  },
})

function PostMediaGrid({
  media,
  className,
}: {
  media: NonNullable<Post["media"]>
  className: string
}) {
  const gallery = media.flatMap((m) => {
    if (m.processingState !== "ready") return []
    const full =
      m.variants.find((v) => v.kind === "large") ??
      m.variants.find((v) => v.kind === "medium") ??
      m.variants.find((v) => v.kind === "thumb") ??
      m.variants[0]
    return [{ id: m.id, src: full.url, alt: m.altText ?? "" }]
  })
  const galleryImages = gallery.map(({ src, alt }) => ({ src, alt }))
  return (
    <div className={className}>
      {media.map((m) => {
        const variant =
          m.variants.find((v) => v.kind === "medium") ?? m.variants[0]
        const isReady = m.processingState === "ready"
        const galleryIndex = gallery.findIndex((g) => g.id === m.id)
        return (
          <div key={m.id} className="aspect-video bg-muted">
            {isReady && (
              <ImageLightbox
                images={galleryImages}
                initialIndex={galleryIndex >= 0 ? galleryIndex : 0}
                disabled={galleryImages.length === 0}
                className="block h-full w-full"
              >
                <img
                  src={variant.url}
                  alt={m.altText ?? ""}
                  className="h-full w-full object-cover"
                />
              </ImageLightbox>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ThreadView() {
  const { handle, id } = Route.useParams()
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setThread(null)
    setError(null)
    api
      .thread(id)
      .then(setThread)
      .catch((e) => setError(e instanceof ApiError ? e.message : "not found"))
  }, [id])

  function replace(next: Post) {
    setThread((t) =>
      t
        ? {
            ancestors: t.ancestors.map((p) => (p.id === next.id ? next : p)),
            post: t.post && t.post.id === next.id ? next : t.post,
            replies: t.replies.map((p) =>
              p.id === next.id ? { ...p, ...next } : p
            ),
          }
        : t
    )
  }

  function onReply(post: Post) {
    setThread((t) =>
      t
        ? {
            ...t,
            post: t.post
              ? {
                  ...t.post,
                  counts: {
                    ...t.post.counts,
                    replies: t.post.counts.replies + 1,
                  },
                }
              : t.post,
            replies: [...t.replies, { ...post, descendantReplyCount: 0 }],
          }
        : t
    )
  }

  if (error) {
    return (
      <main>
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">post not found</p>
          <Link
            to="/$handle"
            params={{ handle }}
            className="mt-3 inline-block text-xs text-primary hover:underline"
          >
            back to @{handle}
          </Link>
        </div>
      </main>
    )
  }

  if (!thread) {
    return (
      <main>
        <div className="px-4 py-16">
          <p className="text-sm text-muted-foreground">loading…</p>
        </div>
      </main>
    )
  }

  const hasAncestors = thread.ancestors.length > 0

  return (
    <main>
      {hasAncestors && (
        <div>
          {thread.ancestors.map((p) => (
            <AncestorPost
              key={p.id}
              post={p}
              onChange={replace}
              showLineBelow={true}
            />
          ))}
        </div>
      )}

      {thread.post && (
        <ParentPost
          post={thread.post}
          onChange={replace}
          hasAncestors={hasAncestors}
        />
      )}

      <ReplyComposer postId={id} onReply={onReply} />

      {thread.replies.length > 0 && (
        <div>
          {thread.replies.map((p) => (
            <div key={p.id}>
              <Link
                to="/$handle/p/$id"
                params={{ handle: p.author.handle ?? "", id: p.id }}
                className="block border-b border-border py-3 pr-4 pl-8 transition-colors hover:bg-muted/30"
              >
                <ReplyCard post={p} onChange={replace} />
              </Link>
              {p.descendantReplyCount > 0 && p.author.handle && (
                <Link
                  to="/$handle/p/$id"
                  params={{ handle: p.author.handle, id: p.id }}
                  className="block border-b border-border bg-muted/10 px-4 py-2 pl-16 text-xs text-primary hover:underline"
                >
                  View {p.descendantReplyCount} more{" "}
                  {p.descendantReplyCount === 1 ? "reply" : "replies"}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function AncestorPost({
  post,
  onChange,
  showLineBelow,
}: {
  post: Post
  onChange: (p: Post) => void
  showLineBelow: boolean
}) {
  const [busy, setBusy] = useState(false)
  const authorHandle = post.author.handle
  const initial = (post.author.displayName ?? authorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  function relativeTime(iso: string): string {
    const d = new Date(iso).getTime()
    const diff = Date.now() - d
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const dd = Math.floor(h / 24)
    if (dd < 7) return `${dd}d`
    return new Date(iso).toLocaleDateString()
  }

  async function optimistic(next: Partial<Post>, op: () => Promise<unknown>) {
    const prev = post
    onChange({ ...post, ...next })
    setBusy(true)
    try {
      await op()
    } catch {
      onChange(prev)
    } finally {
      setBusy(false)
    }
  }

  function toggleLike() {
    if (busy || !post.viewer) return
    const liked = !post.viewer.liked
    optimistic(
      {
        counts: { ...post.counts, likes: post.counts.likes + (liked ? 1 : -1) },
        viewer: { ...post.viewer, liked },
      },
      () => (liked ? api.like(post.id) : api.unlike(post.id))
    )
  }

  function toggleRepost() {
    if (busy || !post.viewer) return
    const reposted = !post.viewer.reposted
    optimistic(
      {
        counts: {
          ...post.counts,
          reposts: post.counts.reposts + (reposted ? 1 : -1),
        },
        viewer: { ...post.viewer, reposted },
      },
      () => (reposted ? api.repost(post.id) : api.unrepost(post.id))
    )
  }

  function toggleBookmark() {
    if (busy || !post.viewer) return
    const bookmarked = !post.viewer.bookmarked
    optimistic(
      {
        counts: {
          ...post.counts,
          bookmarks: post.counts.bookmarks + (bookmarked ? 1 : -1),
        },
        viewer: { ...post.viewer, bookmarked },
      },
      () => (bookmarked ? api.bookmark(post.id) : api.unbookmark(post.id))
    )
  }

  return (
    <article className="relative px-4 py-3">
      {showLineBelow && (
        <div
          className="absolute top-[42px] bottom-0 left-[26px] w-px bg-border"
          aria-hidden="true"
        />
      )}

      <div className="flex gap-2.5">
        <div className="shrink-0">
          {authorHandle ? (
            <Link to="/$handle" params={{ handle: authorHandle }}>
              <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
            </Link>
          ) : (
            <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            {authorHandle ? (
              <Link
                to="/$handle"
                params={{ handle: authorHandle }}
                className="font-semibold hover:underline"
              >
                {post.author.displayName || `@${authorHandle}`}
              </Link>
            ) : (
              <span className="font-semibold">
                {post.author.displayName ?? "unknown"}
              </span>
            )}
            {authorHandle && (
              <span className="text-muted-foreground">@{authorHandle}</span>
            )}
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tabular-nums">
              {relativeTime(post.createdAt)}
            </span>
          </div>

          <p className="mt-1 text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap">
            <RichText text={post.text} />
          </p>

          <MacfolioCardFromText text={post.text} />

          {post.media && post.media.length > 0 && (
            <PostMediaGrid
              media={post.media}
              className={`mt-2 grid gap-px overflow-hidden rounded-sm border border-border ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
            />
          )}

          {post.articleCard && <ArticleCardBlock card={post.articleCard} />}

          {post.poll && (
            <PollBlock
              poll={post.poll}
              onChange={(nextPoll) => onChange({ ...post, poll: nextPoll })}
            />
          )}

          {post.quoteOf && <QuoteEmbed post={post.quoteOf} />}

          <div className="mt-2.5 flex items-center gap-5 text-muted-foreground">
            {authorHandle && (
              <Link
                to="/$handle/p/$id"
                params={{ handle: authorHandle, id: post.id }}
                className="flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums hover:text-foreground"
              >
                <ChatCircleIcon size={16} />
                <span>{post.counts.replies}</span>
              </Link>
            )}
            <button
              type="button"
              onClick={toggleRepost}
              disabled={busy || !post.viewer}
              className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-foreground ${post.viewer?.reposted ? "text-foreground" : ""}`}
            >
              <RepeatIcon size={16} />
              <span>{post.counts.reposts}</span>
            </button>
            <button
              type="button"
              onClick={toggleLike}
              disabled={busy || !post.viewer}
              className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-foreground ${post.viewer?.liked ? "text-foreground" : ""}`}
            >
              {post.viewer?.liked ? (
                <HeartIcon size={16} weight="fill" />
              ) : (
                <HeartIcon size={16} />
              )}
              <span>{post.counts.likes}</span>
            </button>
            <button
              type="button"
              onClick={toggleBookmark}
              disabled={busy || !post.viewer}
              className={`flex items-center gap-1.5 py-0.5 transition-colors hover:text-foreground ${post.viewer?.bookmarked ? "text-foreground" : ""}`}
            >
              {post.viewer?.bookmarked ? (
                <BookmarkIcon size={16} weight="fill" />
              ) : (
                <BookmarkIcon size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function ParentPost({
  post,
  onChange,
  hasAncestors,
}: {
  post: Post
  onChange: (p: Post) => void
  hasAncestors?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const authorHandle = post.author.handle
  const initial = (post.author.displayName ?? authorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  async function optimistic(next: Partial<Post>, op: () => Promise<unknown>) {
    const prev = post
    onChange({ ...post, ...next })
    setBusy(true)
    try {
      await op()
    } catch {
      onChange(prev)
    } finally {
      setBusy(false)
    }
  }

  function toggleLike() {
    if (busy || !post.viewer) return
    const liked = !post.viewer.liked
    optimistic(
      {
        counts: { ...post.counts, likes: post.counts.likes + (liked ? 1 : -1) },
        viewer: { ...post.viewer, liked },
      },
      () => (liked ? api.like(post.id) : api.unlike(post.id))
    )
  }

  function toggleRepost() {
    if (busy || !post.viewer) return
    const reposted = !post.viewer.reposted
    optimistic(
      {
        counts: {
          ...post.counts,
          reposts: post.counts.reposts + (reposted ? 1 : -1),
        },
        viewer: { ...post.viewer, reposted },
      },
      () => (reposted ? api.repost(post.id) : api.unrepost(post.id))
    )
  }

  function toggleBookmark() {
    if (busy || !post.viewer) return
    const bookmarked = !post.viewer.bookmarked
    optimistic(
      {
        counts: {
          ...post.counts,
          bookmarks: post.counts.bookmarks + (bookmarked ? 1 : -1),
        },
        viewer: { ...post.viewer, bookmarked },
      },
      () => (bookmarked ? api.bookmark(post.id) : api.unbookmark(post.id))
    )
  }

  return (
    <article className="relative border-b border-border px-4 py-3.5">
      {hasAncestors && (
        <div
          className="absolute top-0 left-[26px] h-3.5 w-px bg-border"
          aria-hidden="true"
        />
      )}

      <div className="flex items-center gap-2">
        {authorHandle ? (
          <Link to="/$handle" params={{ handle: authorHandle }}>
            <Avatar initial={initial} src={post.author.avatarUrl} size={26} />
          </Link>
        ) : (
          <Avatar initial={initial} src={post.author.avatarUrl} size={26} />
        )}
        <div className="min-w-0 flex-1">
          {authorHandle ? (
            <Link
              to="/$handle"
              params={{ handle: authorHandle }}
              className="block hover:underline"
            >
              <span className="text-[13px] font-semibold">
                {post.author.displayName || `@${authorHandle}`}
              </span>
            </Link>
          ) : (
            <span className="text-[13px] font-semibold">
              {post.author.displayName ?? "unknown"}
            </span>
          )}
          {authorHandle && (
            <span className="block text-[11px] text-muted-foreground">
              @{authorHandle}
            </span>
          )}
        </div>
      </div>

      <p className="mt-2.5 text-[15.5px] leading-[1.5] break-words whitespace-pre-wrap">
        <RichText text={post.text} />
      </p>

      <MacfolioCardFromText text={post.text} />

      {post.media && post.media.length > 0 && (
        <PostMediaGrid
          media={post.media}
          className={`mt-2.5 grid gap-px overflow-hidden rounded-sm border border-border ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        />
      )}

      {post.articleCard && <ArticleCardBlock card={post.articleCard} />}

      {post.poll && (
        <PollBlock
          poll={post.poll}
          onChange={(nextPoll) => onChange({ ...post, poll: nextPoll })}
        />
      )}

      {post.quoteOf && <QuoteEmbed post={post.quoteOf} />}

      {/* <div className="mt-2.5 flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
        {post.counts.reposts > 0 && <span>{post.counts.reposts} reposts</span>}
        {post.counts.likes > 0 && <span>{post.counts.likes} likes</span>}
        {post.counts.bookmarks > 0 && (
          <span>{post.counts.bookmarks} bookmarks</span>
        )}
      </div> */}

      <div className="mt-2.5 flex items-center gap-5 text-muted-foreground">
        <button
          type="button"
          className="flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums hover:text-foreground"
        >
          <ChatCircleIcon size={16} />
          <span>{post.counts.replies}</span>
        </button>
        <button
          type="button"
          onClick={toggleRepost}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-foreground ${post.viewer?.reposted ? "text-foreground" : ""}`}
        >
          <RepeatIcon size={16} />
          <span>{post.counts.reposts}</span>
        </button>
        <button
          type="button"
          onClick={toggleLike}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-foreground ${post.viewer?.liked ? "text-foreground" : ""}`}
        >
          {post.viewer?.liked ? (
            <HeartIcon size={16} weight="fill" />
          ) : (
            <HeartIcon size={16} />
          )}
          <span>{post.counts.likes}</span>
        </button>
        <button
          type="button"
          onClick={toggleBookmark}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 transition-colors hover:text-foreground ${post.viewer?.bookmarked ? "text-foreground" : ""}`}
        >
          {post.viewer?.bookmarked ? (
            <BookmarkIcon size={16} weight="fill" />
          ) : (
            <BookmarkIcon size={16} />
          )}
        </button>
      </div>
    </article>
  )
}

function ReplyComposer({
  postId,
  onReply,
}: {
  postId: string
  onReply: (p: Post) => void
}) {
  const { me } = useMe()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const avatarInitial = (me?.displayName ?? me?.handle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  const canSubmit = text.trim().length > 0 && !loading

  async function submit() {
    if (!canSubmit) return
    setLoading(true)
    try {
      const { post } = await api.createPost({
        text: text.trim(),
        replyToId: postId,
      })
      setText("")
      setExpanded(false)
      onReply(post)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useSubmitHotkey(submit, { enabled: canSubmit, target: textareaRef })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-border px-4 py-2.5"
    >
      <div className="flex gap-2.5">
        <Avatar initial={avatarInitial} src={me?.avatarUrl} size={20} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (textareaRef.current) {
                textareaRef.current.style.height = "auto"
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
              }
            }}
            onFocus={() => setExpanded(true)}
            placeholder="Post your reply"
            rows={1}
            className="w-full resize-none bg-transparent text-[13px] leading-relaxed placeholder:text-muted-foreground focus:outline-none"
          />

          <div
            className={`flex items-center justify-between overflow-hidden transition-all duration-200 ${
              expanded ? "mt-2.5 max-h-10 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="add image"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ImageIcon size={13} />
              </button>
              <button
                type="button"
                aria-label="add poll"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChartBarIcon size={13} />
              </button>
              <button
                type="button"
                aria-label="add hashtag"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <HashIcon size={13} />
              </button>
              <button
                type="button"
                aria-label="mention someone"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <AtIcon size={13} />
              </button>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-[22px] rounded-sm bg-foreground px-2.5 text-[11.5px] font-bold text-background transition-opacity disabled:opacity-50"
            >
              {loading ? "Replying…" : "Reply"}
            </button>
          </div>

          {!expanded && (
            <div className="mt-1 flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-[22px] rounded-sm bg-foreground px-2.5 text-[11.5px] font-bold text-background transition-opacity disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}

function ReplyCard({
  post,
  onChange,
}: {
  post: Post
  onChange: (p: Post) => void
}) {
  const [busy, setBusy] = useState(false)
  const authorHandle = post.author.handle
  const initial = (post.author.displayName ?? authorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  async function optimistic(next: Partial<Post>, op: () => Promise<unknown>) {
    const prev = post
    onChange({ ...post, ...next })
    setBusy(true)
    try {
      await op()
    } catch {
      onChange(prev)
    } finally {
      setBusy(false)
    }
  }

  function toggleLike() {
    if (busy || !post.viewer) return
    const liked = !post.viewer.liked
    optimistic(
      {
        counts: { ...post.counts, likes: post.counts.likes + (liked ? 1 : -1) },
        viewer: { ...post.viewer, liked },
      },
      () => (liked ? api.like(post.id) : api.unlike(post.id))
    )
  }

  function toggleRepost() {
    if (busy || !post.viewer) return
    const reposted = !post.viewer.reposted
    optimistic(
      {
        counts: {
          ...post.counts,
          reposts: post.counts.reposts + (reposted ? 1 : -1),
        },
        viewer: { ...post.viewer, reposted },
      },
      () => (reposted ? api.repost(post.id) : api.unrepost(post.id))
    )
  }

  function relativeTime(iso: string): string {
    const d = new Date(iso).getTime()
    const diff = Date.now() - d
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const dd = Math.floor(h / 24)
    if (dd < 7) return `${dd}d`
    return new Date(iso).toLocaleDateString()
  }

  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        {authorHandle ? (
          <Link
            to="/$handle"
            params={{ handle: authorHandle }}
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
          </Link>
        ) : (
          <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
        )}
        {authorHandle ? (
          <Link
            to="/$handle"
            params={{ handle: authorHandle }}
            className="font-semibold hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {post.author.displayName || `@${authorHandle}`}
          </Link>
        ) : (
          <span className="font-semibold">
            {post.author.displayName ?? "unknown"}
          </span>
        )}
        {authorHandle && (
          <span className="text-muted-foreground">@{authorHandle}</span>
        )}
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground tabular-nums">
          {relativeTime(post.createdAt)}
        </span>
      </div>

      <p className="mt-1.5 text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap">
        <RichText text={post.text} />
      </p>

      <MacfolioCardFromText text={post.text} />

      {post.media && post.media.length > 0 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: stops parent Link from intercepting interactions
        <div onClick={(e) => e.stopPropagation()}>
          <PostMediaGrid
            media={post.media}
            className={`mt-2 grid gap-px overflow-hidden rounded-sm border border-border ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
          />
        </div>
      )}

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stops parent Link from intercepting interactions */}
      <div onClick={(e) => e.stopPropagation()}>
        {post.articleCard && <ArticleCardBlock card={post.articleCard} />}
        {post.poll && (
          <PollBlock
            poll={post.poll}
            onChange={(nextPoll) => onChange({ ...post, poll: nextPoll })}
          />
        )}
        {post.quoteOf && <QuoteEmbed post={post.quoteOf} />}
      </div>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: action bar wrapper */}
      <div
        className="mt-2.5 flex items-center gap-5 text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums hover:text-foreground"
        >
          <ChatCircleIcon size={16} />
          <span>{post.counts.replies}</span>
        </button>
        <button
          type="button"
          onClick={toggleRepost}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-foreground ${post.viewer?.reposted ? "text-foreground" : ""}`}
        >
          <RepeatIcon size={16} />
          <span>{post.counts.reposts}</span>
        </button>
        <button
          type="button"
          onClick={toggleLike}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-foreground ${post.viewer?.liked ? "text-foreground" : ""}`}
        >
          {post.viewer?.liked ? (
            <HeartIcon size={16} weight="fill" />
          ) : (
            <HeartIcon size={16} />
          )}
          <span>{post.counts.likes}</span>
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 py-0.5 transition-colors hover:text-foreground"
        >
          <BookmarkIcon size={16} />
        </button>
      </div>
    </>
  )
}
