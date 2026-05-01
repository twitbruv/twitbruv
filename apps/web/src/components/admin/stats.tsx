import { useQuery } from "@tanstack/react-query"
import {
  ArrowPathIcon,
  BoltIcon,
  BookmarkIcon,
  ChatBubbleLeftIcon,
  EyeIcon,
  FlagIcon,
  HeartIcon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/solid"
import { Avatar } from "@workspace/ui/components/avatar"
import { api } from "../../lib/api"
import { qk } from "../../lib/query-keys"
import { PageError } from "../page-surface"
import { PageFrame } from "../page-frame"

type Icon = React.ComponentType<{ className?: string }>

const ACCENT = {
  sky: {
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/30",
    bar: "bg-sky-500",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
    ring: "ring-violet-500/30",
    bar: "bg-violet-500",
  },
  rose: {
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    ring: "ring-rose-500/30",
    bar: "bg-rose-500",
  },
  emerald: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    bar: "bg-emerald-500",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    bar: "bg-amber-500",
  },
  fuchsia: {
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    ring: "ring-fuchsia-500/30",
    bar: "bg-fuchsia-500",
  },
  teal: {
    text: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/10",
    ring: "ring-teal-500/30",
    bar: "bg-teal-500",
  },
} as const
type AccentKey = keyof typeof ACCENT

const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const fullFormatter = new Intl.NumberFormat("en")

function formatStat(
  value: number | null | undefined,
  compact: boolean
): string {
  if (value === null || value === undefined) return "…"
  return compact && value >= 10_000
    ? compactFormatter.format(value)
    : fullFormatter.format(value)
}

function HeroCard({
  icon: Icon,
  label,
  value,
  accent,
  delta,
  deltaLabel,
}: {
  icon: Icon
  label: string
  value: number | null | undefined
  accent: AccentKey
  delta?: number | null
  deltaLabel?: string
}) {
  const a = ACCENT[accent]
  const isLoading = value === null || value === undefined
  return (
    <div className="group hover:border-primary/20 relative h-full overflow-hidden rounded-lg border border-neutral bg-base-1 p-4 transition-colors">
      <div
        className={`pointer-events-none absolute -top-6 -right-6 size-20 rounded-full opacity-60 blur-2xl ${a.bg}`}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-[0.12em] text-tertiary uppercase">
          {label}
        </p>
        <span
          className={`flex size-7 items-center justify-center rounded-md ring-1 ${a.bg} ${a.text} ${a.ring}`}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p
        className={`relative mt-3 text-3xl font-semibold tracking-tight tabular-nums ${
          isLoading ? "text-tertiary" : ""
        }`}
        title={isLoading ? undefined : fullFormatter.format(Number(value))}
      >
        {formatStat(value, true)}
      </p>
      {delta !== undefined && delta !== null && (
        <p className="relative mt-1 text-[11px] text-tertiary">
          <span className={`font-medium ${a.text}`}>
            +{fullFormatter.format(delta)}
          </span>{" "}
          {deltaLabel}
        </p>
      )}
    </div>
  )
}

type Tone = "default" | "destructive" | "warning" | "positive"

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number | null | undefined
  tone?: Tone
}) {
  const isLoading = value === null || value === undefined
  const toneCls =
    tone === "destructive"
      ? "text-danger"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-500"
        : tone === "positive"
          ? "text-emerald-600 dark:text-emerald-500"
          : ""
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border border-neutral/60 bg-base-1/50 px-2.5 py-1.5">
      <span className="truncate text-[10px] font-medium tracking-wider text-tertiary uppercase">
        {label}
      </span>
      <span
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          isLoading ? "text-tertiary" : toneCls
        }`}
        title={isLoading ? undefined : fullFormatter.format(Number(value))}
      >
        {formatStat(value, true)}
      </span>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string
  icon: Icon
  accent: AccentKey
  children: React.ReactNode
}) {
  const a = ACCENT[accent]
  return (
    <div className="rounded-lg border border-neutral bg-base-1/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`size-1 rounded-full ${a.bar}`} />
        <Icon className={`size-3.5 ${a.text}`} />
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
          {title}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {children}
      </div>
    </div>
  )
}

function OnlineCard({
  count,
  sample,
}: {
  count: number | undefined
  sample: Array<{
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
  }>
}) {
  const a = ACCENT.teal
  const isLoading = count === undefined
  return (
    <div className="flex h-full min-h-[140px] flex-col overflow-hidden rounded-lg border border-neutral bg-base-1 p-4">
      <div className="relative flex shrink-0 items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-[0.12em] text-tertiary uppercase">
          Online now
        </p>
        <span
          className={`flex size-7 items-center justify-center rounded-md ring-1 ${a.bg} ${a.text} ${a.ring}`}
        >
          <BoltIcon className="size-4" />
        </span>
      </div>
      <p
        className={`relative mt-3 shrink-0 text-3xl font-semibold tracking-tight tabular-nums ${
          isLoading ? "text-tertiary" : ""
        }`}
      >
        {isLoading ? "…" : fullFormatter.format(count)}
      </p>
      <p className="relative mt-1 shrink-0 text-[11px] text-tertiary">
        Active foreground tabs (heartbeat)
      </p>
      <div className="relative mt-4 flex min-h-0 flex-1 flex-wrap items-end gap-1">
        {sample.slice(0, 12).map((u) => (
          <span
            key={u.id}
            className="inline-flex"
            title={u.handle ? `@${u.handle}` : (u.displayName ?? undefined)}
          >
            <Avatar
              initial={(u.displayName || u.handle || "?")
                .slice(0, 1)
                .toUpperCase()}
              src={u.avatarUrl}
              className="ring-base-1 size-8 shrink-0 ring-2"
            />
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AdminStats() {
  const { data: stats, error: statsError } = useQuery({
    queryKey: qk.admin.stats(),
    queryFn: () => api.adminStats(),
    staleTime: 60_000,
  })

  const { data: online } = useQuery({
    queryKey: qk.admin.online(),
    queryFn: () => api.adminOnline(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })

  const error = statsError instanceof Error ? statsError.message : null

  if (error) {
    return (
      <PageFrame width="full" className="flex min-h-0 flex-1 flex-col">
        <PageError message={error} />
      </PageFrame>
    )
  }

  return (
    <PageFrame width="full" className="flex flex-col">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="flex lg:col-span-4">
            <HeroCard
              icon={UsersIcon}
              label="Active users"
              value={stats?.users.active}
              accent="sky"
              delta={stats?.users.newToday}
              deltaLabel="new today"
            />
          </div>
          <div className="flex lg:col-span-8">
            <OnlineCard count={online?.count} sample={online?.sample ?? []} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-6">
          <HeroCard
            icon={ChatBubbleLeftIcon}
            label="Posts"
            value={stats?.posts.total}
            accent="violet"
            delta={stats?.posts.newToday}
            deltaLabel="new today"
          />
          <HeroCard
            icon={HeartIcon}
            label="Likes"
            value={stats?.engagement.likes}
            accent="rose"
            delta={stats?.engagement.likesToday}
            deltaLabel="new today"
          />
          <HeroCard
            icon={ArrowPathIcon}
            label="Reposts"
            value={stats?.engagement.reposts}
            accent="emerald"
          />
          <HeroCard
            icon={BookmarkIcon}
            label="Bookmarks"
            value={stats?.engagement.bookmarks}
            accent="amber"
          />
          <HeroCard
            icon={EyeIcon}
            label="Impressions"
            value={stats?.posts.totalImpressions}
            accent="fuchsia"
          />
          <HeroCard
            icon={FlagIcon}
            label="Open reports"
            value={stats?.reports.open}
            accent="amber"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          <Section title="Users" icon={UsersIcon} accent="sky">
            <MiniStat label="Total" value={stats?.users.total} />
            <MiniStat label="Active" value={stats?.users.active} />
            <MiniStat label="Verified" value={stats?.users.verified} />
            <MiniStat label="Admins" value={stats?.users.admins} />
            <MiniStat
              label="Banned"
              value={stats?.users.banned}
              tone="destructive"
            />
            <MiniStat
              label="Shadow"
              value={stats?.users.shadowBanned}
              tone="warning"
            />
            <MiniStat
              label="Deleted"
              value={stats?.users.deleted}
              tone="destructive"
            />
            <MiniStat
              label="New 24h"
              value={stats?.users.newToday}
              tone="positive"
            />
            <MiniStat
              label="New 7d"
              value={stats?.users.newThisWeek}
              tone="positive"
            />
          </Section>

          <Section title="Posts" icon={ChatBubbleLeftIcon} accent="violet">
            <MiniStat label="Total" value={stats?.posts.total} />
            <MiniStat label="Original" value={stats?.posts.original} />
            <MiniStat label="Replies" value={stats?.posts.replies} />
            <MiniStat label="Reposts" value={stats?.posts.reposts} />
            <MiniStat label="Quotes" value={stats?.posts.quotes} />
            <MiniStat label="Edited" value={stats?.posts.edited} />
            <MiniStat
              label="Sensitive"
              value={stats?.posts.sensitive}
              tone="warning"
            />
            <MiniStat
              label="Deleted"
              value={stats?.posts.deleted}
              tone="destructive"
            />
            <MiniStat
              label="New 24h"
              value={stats?.posts.newToday}
              tone="positive"
            />
            <MiniStat
              label="New 7d"
              value={stats?.posts.newThisWeek}
              tone="positive"
            />
          </Section>

          <Section title="Engagement" icon={HeartIcon} accent="rose">
            <MiniStat label="Likes" value={stats?.engagement.likes} />
            <MiniStat
              label="Likes 24h"
              value={stats?.engagement.likesToday}
              tone="positive"
            />
            <MiniStat label="Bookmarks" value={stats?.engagement.bookmarks} />
            <MiniStat label="Reposts" value={stats?.engagement.reposts} />
            <MiniStat label="Quotes" value={stats?.engagement.quotes} />
            <MiniStat label="Replies" value={stats?.engagement.replies} />
          </Section>

          <Section title="Reach" icon={EyeIcon} accent="fuchsia">
            <MiniStat
              label="Impressions"
              value={stats?.posts.totalImpressions}
            />
            <MiniStat
              label="Conversations"
              value={stats?.messaging.conversations}
            />
            <MiniStat label="Messages" value={stats?.messaging.messages} />
          </Section>

          <Section title="Social graph" icon={UserGroupIcon} accent="emerald">
            <MiniStat label="Follows" value={stats?.social.follows} />
            <MiniStat
              label="Follows 24h"
              value={stats?.social.followsToday}
              tone="positive"
            />
            <MiniStat
              label="Blocks"
              value={stats?.social.blocks}
              tone="destructive"
            />
            <MiniStat
              label="Mutes"
              value={stats?.social.mutes}
              tone="warning"
            />
          </Section>

          <Section title="Reports" icon={FlagIcon} accent="amber">
            <MiniStat label="Total" value={stats?.reports.total} />
            <MiniStat label="Open" value={stats?.reports.open} tone="warning" />
            <MiniStat label="Triaged" value={stats?.reports.triaged} />
            <MiniStat
              label="Actioned"
              value={stats?.reports.actioned}
              tone="positive"
            />
            <MiniStat label="Dismissed" value={stats?.reports.dismissed} />
          </Section>
        </div>
      </div>
    </PageFrame>
  )
}
