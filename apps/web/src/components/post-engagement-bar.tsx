import { useNavigate } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowPathRoundedSquareIcon as ArrowPathOutline,
  BookmarkIcon as BookmarkOutline,
  ChatBubbleLeftIcon as ChatBubbleLeftOutline,
  HeartIcon as HeartOutline,
} from "@heroicons/react/24/outline"
import {
  ArrowPathRoundedSquareIcon as ArrowPathSolid,
  BookmarkIcon as BookmarkSolid,
  ChatBubbleBottomCenterTextIcon,
  HeartIcon as HeartSolid,
} from "@heroicons/react/24/solid"
import { AnimatedNumber } from "@workspace/ui/components/animated-number"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { bumpPostCounts } from "../lib/query-cache"
import {
  useTogglePostBookmark,
  useTogglePostLike,
  useTogglePostRepost,
} from "../lib/mutations/posts"
import { Compose } from "./compose"
import type { CSSProperties } from "react"
import type { Post } from "../lib/api"

const PARTICLES = [
  { x: "-14px", y: "-16px" },
  { x: "14px", y: "-16px" },
  { x: "-18px", y: "0px" },
  { x: "18px", y: "0px" },
  { x: "-14px", y: "14px" },
  { x: "14px", y: "14px" },
  { x: "0px", y: "-18px" },
  { x: "0px", y: "16px" },
]

function LikeIcon({ liked, burst }: { liked: boolean; burst: boolean }) {
  return (
    <span className="relative flex size-4 items-center justify-center">
      <HeartOutline
        className={cn(
          "size-4 transition-opacity duration-150",
          liked || burst ? "opacity-0" : "opacity-100"
        )}
      />
      <HeartSolid
        className={cn(
          "absolute inset-0 size-4 text-like",
          liked && !burst && "opacity-100",
          !liked && "opacity-0",
          burst && "animate-[heartFillIn_350ms_ease-out_forwards]"
        )}
      />
      {burst && (
        <span className="pointer-events-none absolute inset-0 z-10">
          {PARTICLES.map(({ x, y }, i) => (
            <span
              key={i}
              className="absolute top-1/2 left-1/2 size-1.5 animate-[particleBurst_500ms_ease-out_forwards] rounded-full bg-like"
              style={{ "--x": x, "--y": y } as CSSProperties}
            />
          ))}
        </span>
      )}
    </span>
  )
}

export function PostEngagementBar({ post }: { post: Post }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const likeMut = useTogglePostLike(post)
  const repostMut = useTogglePostRepost(post)
  const bookmarkMut = useTogglePostBookmark(post)

  const [heartBurst, setHeartBurst] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)

  const canEngage = Boolean(post.viewer)
  const liked = Boolean(post.viewer?.liked)
  const reposted = Boolean(post.viewer?.reposted)
  const bookmarked = Boolean(post.viewer?.bookmarked)
  const authorHandle = post.author.handle

  const reposts = post.counts.reposts + post.counts.quotes

  const handleReply = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!authorHandle) return
      navigate({
        to: "/$handle/p/$id",
        params: { handle: authorHandle, id: post.id },
      })
    },
    [authorHandle, navigate, post.id]
  )

  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!canEngage) return
      if (!liked) {
        setHeartBurst(true)
        setTimeout(() => setHeartBurst(false), 500)
      }
      likeMut.mutate()
    },
    [canEngage, liked, likeMut]
  )

  const handleBookmark = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!canEngage) return
      bookmarkMut.mutate()
    },
    [canEngage, bookmarkMut]
  )

  const handleRepost = useCallback(() => {
    if (!canEngage) return
    repostMut.mutate()
  }, [canEngage, repostMut])

  const handleQuote = useCallback(() => {
    if (!canEngage) return
    setQuoteOpen(true)
  }, [canEngage])

  return (
    <div
      className="mt-2 flex items-center"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex-1">
        <Button
          variant="transparent"
          size="sm"
          iconLeft={<ChatBubbleLeftOutline />}
          onClick={handleReply}
          disabled={!authorHandle}
          className="text-tertiary"
        >
          {post.counts.replies > 0 ? (
            <AnimatedNumber value={post.counts.replies} />
          ) : null}
        </Button>
      </div>

      <div className="flex-1" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="transparent"
                size="sm"
                iconLeft={reposted ? <ArrowPathSolid /> : <ArrowPathOutline />}
                disabled={!canEngage}
                className={cn("text-tertiary", reposted && "text-success")}
              >
                {reposts > 0 ? <AnimatedNumber value={reposts} /> : null}
              </Button>
            }
          />
          <DropdownMenu.Content align="start" sideOffset={4}>
            <DropdownMenu.Item
              onClick={handleRepost}
              icon={<ArrowPathOutline className="size-4" />}
            >
              {reposted ? "Undo repost" : "Repost"}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onClick={handleQuote}
              icon={<ChatBubbleBottomCenterTextIcon className="size-4" />}
            >
              Quote
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <div className="flex-1">
        <Button
          variant="transparent"
          size="sm"
          iconLeft={<LikeIcon liked={liked} burst={heartBurst} />}
          onClick={handleLike}
          disabled={!canEngage}
          className={cn(
            "text-tertiary",
            liked && "text-like",
            heartBurst && "animate-[heartBounce_400ms_ease-out]"
          )}
        >
          {post.counts.likes > 0 ? (
            <AnimatedNumber value={post.counts.likes} />
          ) : null}
        </Button>
      </div>

      <div>
        <Button
          variant="transparent"
          size="sm"
          iconLeft={bookmarked ? <BookmarkSolid /> : <BookmarkOutline />}
          onClick={handleBookmark}
          disabled={!canEngage}
          className={cn("text-tertiary", bookmarked && "text-primary")}
        />
      </div>

      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="border-b border-neutral px-4 py-3">
            <DialogTitle className="text-sm font-semibold">
              Quote post
            </DialogTitle>
            <DialogDescription className="sr-only">
              Write your commentary. The original post will be attached.
            </DialogDescription>
          </DialogHeader>
          <Compose
            quoteOfId={post.id}
            quoted={post}
            onCreated={() => {
              bumpPostCounts(qc, post.id, "quotes", 1)
              setQuoteOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
