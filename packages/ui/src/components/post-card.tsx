import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import { Hover } from "@workspace/ui/components/hover"
import { AnimatedNumber } from "@workspace/ui/components/animated-number"
import {
  ChatBubbleLeftIcon as ChatBubbleLeftOutline,
  ArrowPathRoundedSquareIcon as ArrowPathOutline,
  HeartIcon as HeartOutline,
  BookmarkIcon as BookmarkOutline,
  EllipsisHorizontalIcon,
  ChatBubbleBottomCenterTextIcon,
} from "@heroicons/react/24/outline"
import {
  ArrowPathRoundedSquareIcon as ArrowPathSolid,
  HeartIcon as HeartSolid,
  BookmarkIcon as BookmarkSolid,
} from "@heroicons/react/24/solid"

export type PostMedia =
  | { type: "image"; url: string; alt?: string }
  | { type: "video"; url: string; thumbnailUrl: string }

export interface PostQuoteOf {
  author: {
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
  }
  text: string
  time: string
  /** Optional thumbnail for the quoted post's media */
  thumbnailUrl?: string
  onClick?: () => void
}

export interface PostCardProps {
  author: {
    handle: string
    displayName: string
    avatarUrl: string | null
  }
  text: string
  time: string
  likes: number
  replies: number
  reposts: number
  liked?: boolean
  reposted?: boolean
  bookmarked?: boolean
  /** Media attachments (images, videos) */
  media?: PostMedia[]
  /** Show "X reposted" badge above the post */
  repostedBy?: string
  /** Quoted post embed */
  quoteOf?: PostQuoteOf
  /** Truncate long text in feed mode. When false, shows full text. */
  truncateText?: boolean
  /** Disable hover effect (e.g. for the main post on a detail page) */
  disableHover?: boolean
  /** Show a connecting line above/below the avatar (for threads) */
  threadLine?: "top" | "bottom" | "both"
  className?: string
  onClick?: () => void
  onLike?: () => void
  onRepost?: () => void
  onQuote?: () => void
  onBookmark?: () => void
  onReply?: () => void
  /** Called when an image in the media grid is clicked, with the image index */
  onMediaClick?: (index: number) => void
  /** Rich embeds below the post body (e.g. link unfurls) — rendered before media */
  belowText?: ReactNode
}

export function PostCard({
  author,
  text,
  time,
  likes,
  replies,
  reposts,
  liked = false,
  reposted = false,
  bookmarked = false,
  media,
  repostedBy,
  quoteOf,
  truncateText = false,
  threadLine,
  className,
  onClick,
  onLike,
  onRepost,
  onQuote,
  onBookmark,
  onReply,
  onMediaClick,
  belowText,
  disableHover = false,
}: PostCardProps) {
  const showLineTop = threadLine === "top" || threadLine === "both"
  const showLineBottom = threadLine === "bottom" || threadLine === "both"

  // Heart burst animation state
  const [heartBurst, setHeartBurst] = useState(false)

  // Truncation detection
  const textRef = useRef<HTMLParagraphElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    if (!truncateText || !textRef.current) return
    const el = textRef.current
    setIsTruncated(el.scrollHeight > el.clientHeight)
  }, [text, truncateText])

  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!liked) {
        setHeartBurst(true)
        setTimeout(() => setHeartBurst(false), 500)
      }
      onLike?.()
    },
    [liked, onLike]
  )

  return (
    <Hover
      borderRadius="rounded-2xl"
      background="bg-subtle/50"
      disabled={disableHover}
      fullWidth
      className={cn(!disableHover && "cursor-pointer", className)}
    >
      <article className="flex w-full flex-col px-4 py-3" onClick={onClick}>
        {/* Repost badge */}
        {repostedBy && (
          <div className="mb-1 flex items-center gap-3 text-sm text-tertiary">
            <div className="flex w-10 shrink-0 justify-end">
              <ArrowPathSolid className="size-4" />
            </div>
            <span>{repostedBy} reposted</span>
          </div>
        )}

        <div className="flex w-full gap-3">
          {/* Thread line + Avatar column */}
          <div className="relative flex flex-col items-center">
            {showLineTop && (
              <div
                className="absolute left-1/2 w-px -translate-x-1/2 bg-[var(--border-color-neutral)]"
                style={{ top: "-12px", height: "8px" }}
              />
            )}
            <Avatar
              initial={author.displayName[0] ?? "?"}
              src={author.avatarUrl}
              size="lg"
            />
            {showLineBottom && (
              <div className="mt-1 mb-[-12px] w-px flex-1 bg-[var(--border-color-neutral)]" />
            )}
          </div>

          {/* Content column */}
          <div className="relative min-w-0 flex-1">
            {/* Menu button (absolute, top right) */}
            <Button
              variant="transparent"
              size="sm"
              iconLeft={<EllipsisHorizontalIcon />}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-0 right-0 opacity-0 transition-opacity group-hover/h:opacity-100"
            />

            {/* Header: name, handle, time */}
            <div className="flex items-baseline gap-1.5 pr-8 text-sm">
              <span className="truncate font-semibold text-primary">
                {author.displayName}
              </span>
              <span className="truncate text-tertiary">@{author.handle}</span>
              <span className="text-tertiary">&middot;</span>
              <span className="shrink-0 text-tertiary">{time}</span>
            </div>

            {/* Post text */}
            <p
              ref={textRef}
              className={cn(
                "mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-primary",
                truncateText && "line-clamp-5"
              )}
            >
              <PostText text={text} />
            </p>

            {/* Show more */}
            {truncateText && isTruncated && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClick?.()
                }}
                className="mt-1 text-sm font-medium text-secondary hover:text-primary"
              >
                Show more
              </button>
            )}

            {belowText ? <div className="mt-2 min-w-0">{belowText}</div> : null}

            {/* Media */}
            {media && media.length > 0 && (
              <MediaGrid media={media} onImageClick={onMediaClick} />
            )}

            {/* Quote embed */}
            {quoteOf && <QuoteEmbed quote={quoteOf} />}

            {/* Action bar */}
            <div className="mt-2 flex items-center">
              {/* Reply */}
              <div className="flex-1">
                <Button
                  variant="transparent"
                  size="sm"
                  iconLeft={<ChatBubbleLeftOutline />}
                  onClick={(e) => {
                    e.stopPropagation()
                    onReply?.()
                  }}
                  className="text-tertiary"
                >
                  {replies > 0 ? <AnimatedNumber value={replies} /> : null}
                </Button>
              </div>

              {/* Repost */}
              <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    render={
                      <Button
                        variant="transparent"
                        size="sm"
                        iconLeft={
                          reposted ? <ArrowPathSolid /> : <ArrowPathOutline />
                        }
                        className={cn(
                          "text-tertiary",
                          reposted && "text-success"
                        )}
                      >
                        {reposts > 0 ? (
                          <AnimatedNumber value={reposts} />
                        ) : null}
                      </Button>
                    }
                  />
                  <DropdownMenu.Content align="start" sideOffset={4}>
                    <DropdownMenu.Item
                      onClick={() => onRepost?.()}
                      icon={<ArrowPathOutline className="size-4" />}
                    >
                      {reposted ? "Undo repost" : "Repost"}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onClick={() => onQuote?.()}
                      icon={
                        <ChatBubbleBottomCenterTextIcon className="size-4" />
                      }
                    >
                      Quote
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>

              {/* Like */}
              <div className="flex-1">
                <Button
                  variant="transparent"
                  size="sm"
                  iconLeft={<LikeIcon liked={liked} burst={heartBurst} />}
                  onClick={handleLike}
                  className={cn(
                    "text-tertiary",
                    liked && "text-like",
                    heartBurst && "animate-[heartBounce_400ms_ease-out]"
                  )}
                >
                  {likes > 0 ? <AnimatedNumber value={likes} /> : null}
                </Button>
              </div>

              {/* Bookmark */}
              <div>
                <Button
                  variant="transparent"
                  size="sm"
                  iconLeft={
                    bookmarked ? <BookmarkSolid /> : <BookmarkOutline />
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    onBookmark?.()
                  }}
                  className={cn("text-tertiary", bookmarked && "text-primary")}
                />
              </div>
            </div>
          </div>
        </div>
      </article>
    </Hover>
  )
}

// ── Like icon with burst animation ────────────────────

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
    <span className="relative flex items-center justify-center">
      {/* Outline heart (fades out when liked) */}
      <HeartOutline
        className={cn(
          "size-4 transition-opacity duration-150",
          liked ? "opacity-0" : "opacity-100"
        )}
      />

      {/* Filled red heart (scales up from 0.5 + fades in) */}
      <HeartSolid
        className={cn(
          "absolute inset-0 size-4 text-like",
          liked && !burst && "opacity-100",
          !liked && "opacity-0",
          burst && "animate-[heartFillIn_350ms_ease-out_forwards]"
        )}
      />

      {/* Particles anchored to icon center */}
      {burst && (
        <span className="pointer-events-none absolute inset-0 z-10">
          {PARTICLES.map(({ x, y }, i) => (
            <span
              key={i}
              className="absolute top-1/2 left-1/2 size-1.5 animate-[particleBurst_500ms_ease-out_forwards] rounded-full bg-like"
              style={{ "--x": x, "--y": y } as React.CSSProperties}
            />
          ))}
        </span>
      )}
    </span>
  )
}

// ── Media grid ────────────────────────────────────────

function MediaGrid({
  media,
  onImageClick,
}: {
  media: PostMedia[]
  onImageClick?: (index: number) => void
}) {
  // If there's a single video, render a video player
  if (media.length === 1 && media[0].type === "video") {
    return (
      <div
        className="mt-2 overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          src={media[0].url}
          poster={media[0].thumbnailUrl || undefined}
          controls
          preload="metadata"
          className="max-h-96 w-full object-cover"
        />
      </div>
    )
  }

  const images = media.filter((m) => m.type === "image")
  const count = images.length

  if (count === 0) return null

  return (
    <div
      className={cn(
        "mt-2 grid gap-0.5 overflow-hidden rounded-xl",
        count === 1 && "grid-cols-1",
        count === 2 && "grid-cols-2",
        count >= 3 && "grid-cols-2 grid-rows-2"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {images.slice(0, 4).map((img, i) => (
        <img
          key={i}
          src={img.type === "image" ? img.url : ""}
          alt={img.type === "image" ? (img.alt ?? "") : ""}
          className={cn(
            "w-full cursor-pointer object-cover transition-opacity hover:opacity-90",
            count === 1 && "max-h-80",
            count === 2 && "aspect-[4/3]",
            count >= 3 && i === 0 && "row-span-2 h-full",
            count >= 3 && i > 0 && "aspect-square"
          )}
          onClick={(e) => {
            e.stopPropagation()
            onImageClick?.(i)
          }}
        />
      ))}
    </div>
  )
}

// ── Quote embed ───────────────────────────────────────

function QuoteEmbed({ quote }: { quote: PostQuoteOf }) {
  const displayName =
    quote.author.displayName || `@${quote.author.handle ?? "unknown"}`
  const handle = quote.author.handle

  return (
    <div
      className="mt-2 overflow-hidden rounded-xl border border-neutral transition-colors hover:bg-subtle/50"
      onClick={(e) => {
        e.stopPropagation()
        quote.onClick?.()
      }}
      role={quote.onClick ? "button" : undefined}
    >
      <div className="flex gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            <Avatar
              initial={displayName[0] ?? "?"}
              src={quote.author.avatarUrl}
              size="xs"
            />
            <span className="font-semibold text-primary">{displayName}</span>
            {handle && <span className="text-tertiary">@{handle}</span>}
            <span className="text-tertiary">&middot;</span>
            <span className="text-tertiary">{quote.time}</span>
          </div>
          {quote.text && (
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed whitespace-pre-wrap text-primary">
              {quote.text}
            </p>
          )}
        </div>
        {quote.thumbnailUrl && (
          <div className="size-16 shrink-0 overflow-hidden rounded-lg">
            <img
              src={quote.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Text with @mention highlighting ───────────────────

function PostText({ text }: { text: string }) {
  const parts = text.split(/(@\w+)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span
            key={i}
            className="font-medium text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
