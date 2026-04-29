import {
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  ChartBarIcon,
  ChatBubbleLeftIcon,
  HeartIcon,
} from "@heroicons/react/24/outline"
import { CheckBadgeIcon } from "@heroicons/react/24/solid"
import { cn } from "../lib/utils"
import { Avatar } from "./avatar"
import { LinkCardShell } from "./link-card"

function formatTimestamp(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export interface XStatusCardProps {
  url: string
  text: string
  authorScreenName: string
  authorName: string
  authorAvatarUrl?: string | null
  authorVerified?: boolean
  replies: number
  retweets: number
  likes: number
  quotes: number
  views?: number | null
  createdAt?: string | null
  className?: string
}

export function XStatusCard({
  url,
  text,
  authorScreenName,
  authorName,
  authorAvatarUrl,
  authorVerified,
  replies,
  retweets,
  likes,
  quotes,
  views,
  createdAt,
  className,
}: XStatusCardProps) {
  return (
    <LinkCardShell href={url} className={cn("p-0", className)}>
      <div className="flex items-center gap-2 border-b border-neutral bg-base-2/60 px-3 py-1.5 text-sm text-tertiary">
        <XMark className="size-3.5" />
        <span className="truncate">@{authorScreenName}</span>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex gap-3">
          <Avatar
            initial={authorName.charAt(0)}
            src={authorAvatarUrl}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="flex items-center gap-0.5 truncate">
                <span className="font-semibold text-primary">{authorName}</span>
                {authorVerified ? (
                  <CheckBadgeIcon
                    aria-hidden
                    className="size-4 shrink-0 text-sky-500"
                  />
                ) : null}
              </span>
              <span className="truncate text-tertiary">
                @{authorScreenName}
              </span>
            </div>
            {createdAt ? (
              <div className="mt-0.5 text-sm text-tertiary">
                {formatTimestamp(createdAt)}
              </div>
            ) : null}
          </div>
        </div>

        <p className="wrap-break-words text-sm leading-relaxed whitespace-pre-wrap text-primary">
          {text}
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-neutral pt-3 text-sm text-tertiary">
          <span className="inline-flex items-center gap-1">
            <ChatBubbleLeftIcon className="size-3.5 shrink-0" />
            {compactCount(replies)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ArrowPathRoundedSquareIcon className="size-3.5 shrink-0" />
            {compactCount(retweets)}
          </span>
          <span className="inline-flex items-center gap-1">
            <HeartIcon className="size-3.5 shrink-0" />
            {compactCount(likes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ArrowUturnLeftIcon className="size-3.5 shrink-0" />
            {compactCount(quotes)}
          </span>
          {views != null ? (
            <span className="inline-flex items-center gap-1">
              <ChartBarIcon className="size-3.5 shrink-0" />
              {compactCount(views)}
            </span>
          ) : null}
        </div>
      </div>
    </LinkCardShell>
  )
}
