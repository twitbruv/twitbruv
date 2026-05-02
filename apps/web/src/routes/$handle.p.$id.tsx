import {
  Link,
  createFileRoute,
  useCanGoBack,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import { useCallback, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon } from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { APP_NAME } from "../lib/env"
import { qk } from "../lib/query-keys"
import { buildSeoMeta, canonicalLink, clipDescription } from "../lib/seo"
import { Compose } from "../components/compose"
import { FeedPostCard } from "../components/feed-post-card"
import { PageError } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import type { Post, Thread } from "../lib/api"

export const Route = createFileRoute("/$handle/p/$id")({
  component: ThreadView,
  loader: async ({ params, context }) => {
    const ctx = context
    try {
      const postResult = await api.post(params.id)
      ctx.queryClient.setQueryData(qk.post(params.id), postResult)
      await ctx.queryClient.ensureQueryData({
        queryKey: qk.thread(params.id),
        queryFn: () => api.thread(params.id),
      })
      return { post: postResult.post }
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
            url: path,
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

function ThreadView() {
  const { handle, id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const queryClient = useQueryClient()
  const focalRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)

  const {
    data: thread,
    error: queryError,
    isPending,
    isError,
  } = useQuery({
    queryKey: qk.thread(id),
    queryFn: () => api.thread(id),
    retry: false,
  })

  const error = isError
    ? queryError instanceof ApiError && queryError.status === 404
      ? "Post not found"
      : "Something went wrong"
    : null

  useEffect(() => {
    didScrollRef.current = false
  }, [id])

  useEffect(() => {
    if (!thread || didScrollRef.current) return
    if (thread.ancestors.length === 0) return
    didScrollRef.current = true
    requestAnimationFrame(() => {
      focalRef.current?.scrollIntoView({ block: "start" })
    })
  }, [thread])

  const onReply = useCallback(
    (post: Post) => {
      queryClient.setQueryData(qk.thread(id), (prev: Thread | undefined) => {
        if (!prev) return prev
        return {
          ...prev,
          post: prev.post
            ? {
                ...prev.post,
                counts: {
                  ...prev.post.counts,
                  replies: prev.post.counts.replies + 1,
                },
              }
            : prev.post,
          replies: [...prev.replies, { ...post, descendantReplyCount: 0 }],
        }
      })
    },
    [queryClient, id]
  )

  if (error) {
    return (
      <PageFrame>
        <PageError message={error} className="px-4 py-16" />
        <div className="px-4 text-center">
          <Link
            to="/$handle"
            params={{ handle }}
            className="text-xs text-primary hover:underline"
          >
            Back to @{handle}
          </Link>
        </div>
      </PageFrame>
    )
  }

  if (isPending || !thread) {
    return (
      <PageFrame>
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-tertiary">Loading…</p>
        </div>
      </PageFrame>
    )
  }

  const hasParents = thread.ancestors.length > 0

  return (
    <PageFrame>
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 bg-base-1/80 px-4 backdrop-blur-md">
        <Button
          variant="transparent"
          size="sm"
          iconLeft={<ArrowLeftIcon className="size-4" />}
          onClick={() => {
            if (canGoBack) {
              router.history.back()
            } else {
              navigate({ to: "/" })
            }
          }}
          aria-label="Back"
        />
        <span className="text-sm font-semibold text-primary">Post</span>
      </header>

      {hasParents &&
        thread.ancestors.map((p, i) => {
          const isFirst = i === 0
          const threadLine = isFirst ? "bottom" : "both"
          return <FeedPostCard key={p.id} post={p} threadLine={threadLine} />
        })}

      {thread.post && (
        <div ref={focalRef}>
          <FeedPostCard
            post={thread.post}
            threadLine={hasParents ? "top" : undefined}
            disableHover
            truncateText={false}
          />
        </div>
      )}

      {thread.post && (
        <div>
          <Compose
            replyToId={thread.post.id}
            onCreated={onReply}
            collapsible
            placeholder="Post your reply"
          />
        </div>
      )}

      {thread.replies.map((reply) => (
        <div key={reply.id}>
          <FeedPostCard post={reply} />
          {reply.descendantReplyCount > 0 && reply.author.handle && (
            <div className="px-4 pb-2 pl-[68px]">
              <Button
                variant="transparent"
                size="sm"
                onClick={() =>
                  navigate({
                    to: "/$handle/p/$id",
                    params: {
                      handle: reply.author.handle!,
                      id: reply.id,
                    },
                  })
                }
              >
                View {reply.descendantReplyCount} more{" "}
                {reply.descendantReplyCount === 1 ? "reply" : "replies"}
              </Button>
            </div>
          )}
        </div>
      ))}
    </PageFrame>
  )
}
