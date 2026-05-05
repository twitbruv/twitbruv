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
import { Skeleton } from "@workspace/ui/components/skeleton"
import { api } from "../../lib/api"
import { qk } from "../../lib/query-keys"
import { PageError } from "../page-surface"
import { PageFrame } from "../page-frame"
import { ProfileHoverCard } from "../profile-hover-card"

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
  pending,
}: {
  icon: Icon
  label: string
  value: number | null | undefined
  accent: AccentKey
  delta?: number | null
  deltaLabel?: string
  pending?: boolean
}) {
  const a = ACCENT[accent]
  const isLoading = pending || value === null || value === undefined
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
      {isLoading ? (
        <Skeleton className="relative mt-3 h-9 max-w-32" />
      ) : (
        <p
          className="relative mt-3 text-3xl font-semibold tracking-tight tabular-nums"
          title={fullFormatter.format(Number(value))}
        >
          {formatStat(value, true)}
        </p>
      )}
      {!isLoading && delta !== undefined && delta !== null && (
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
  pending,
}: {
  label: string
  value: number | null | undefined
  tone?: Tone
  pending?: boolean
}) {
  const isLoading = pending || value === null || value === undefined
  const toneCls =
    tone === "destructive"
      ? "text-danger"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-500"
        : tone === "positive"
          ? "text-emerald-600 dark:text-emerald-500"
          : ""
  return (
    <div
      className="rounded-md border border-neutral/60 bg-base-1/50 px-2.5 py-1"
      title={label}
    >
      <span className="block text-[11px] leading-snug font-medium tracking-wider text-tertiary uppercase">
        {label}
      </span>
      {isLoading ? (
        <Skeleton className="mt-1 h-5 w-16 max-w-full" />
      ) : (
        <span
          className={`mt-1 block text-sm font-semibold tabular-nums ${toneCls}`}
          title={fullFormatter.format(Number(value))}
        >
          {formatStat(value, true)}
        </span>
      )}
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
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">{children}</div>
    </div>
  )
}

function OnlineCard({
  loading,
  error,
  presenceUnavailable,
  count,
  sample,
}: {
  loading: boolean
  error?: boolean
  presenceUnavailable?: boolean
  count: number | undefined
  sample: Array<{
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
  }>
}) {
  const a = ACCENT.teal
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
      <div className="relative mt-3 shrink-0">
        {loading ? (
          <Skeleton className="h-9 w-24 max-w-full" />
        ) : error ? (
          <p
            className="text-3xl font-semibold tracking-tight text-tertiary tabular-nums"
            title="Could not load online count"
          >
            —
          </p>
        ) : (
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {fullFormatter.format(count ?? 0)}
          </p>
        )}
      </div>
      <p className="relative mt-1 shrink-0 text-[11px] text-tertiary">
        Active foreground tabs (heartbeat)
        {presenceUnavailable && !loading && !error ? (
          <span className="mt-0.5 block text-amber-600 dark:text-amber-500">
            Presence store unavailable (check Redis).
          </span>
        ) : null}
      </p>
      <div className="relative mt-4 flex min-h-0 flex-1 flex-wrap items-end gap-1">
        {loading
          ? Array.from({ length: 8 }, (_, i) => (
              <Skeleton
                key={i}
                className="ring-base-1 size-8 shrink-0 rounded-full ring-2"
              />
            ))
          : sample.slice(0, 12).map((u) => {
              const avatar = (
                <Avatar
                  initial={(u.displayName || u.handle || "?")
                    .slice(0, 1)
                    .toUpperCase()}
                  src={u.avatarUrl}
                  className={`ring-base-1 size-8 shrink-0 ring-2 ${
                    u.handle ? "cursor-pointer" : ""
                  }`}
                />
              )
              return u.handle ? (
                <ProfileHoverCard key={u.id} handle={u.handle}>
                  {avatar}
                </ProfileHoverCard>
              ) : (
                <span
                  key={u.id}
                  className="inline-flex"
                  title={u.displayName ?? undefined}
                >
                  {avatar}
                </span>
              )
            })}
      </div>
    </div>
  )
}

export default function AdminStats() {
  const {
    data: stats,
    error: statsError,
    isPending: statsPending,
  } = useQuery({
    queryKey: qk.admin.stats(),
    queryFn: () => api.adminStats(),
    staleTime: 60_000,
  })

  const {
    data: online,
    isPending: onlinePending,
    isError: onlineError,
  } = useQuery({
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
      <div className="p-4">
        <div className="grid grid-cols-12 gap-3 lg:gap-4">
          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <HeroCard
              icon={UsersIcon}
              label="Active users"
              value={stats?.users.active}
              accent="sky"
              delta={stats?.users.newToday}
              deltaLabel="new today"
              pending={statsPending}
            />
          </div>
          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <OnlineCard
              loading={onlinePending}
              error={onlineError}
              presenceUnavailable={online?.presenceUnavailable}
              count={online?.count}
              sample={online?.sample ?? []}
            />
          </div>

          <div className="col-span-6 min-w-0 md:col-span-4 lg:col-span-2 [&>*]:w-full">
            <HeroCard
              icon={ChatBubbleLeftIcon}
              label="Posts"
              value={stats?.posts.total}
              accent="violet"
              delta={stats?.posts.newToday}
              deltaLabel="new today"
              pending={statsPending}
            />
          </div>
          <div className="col-span-6 min-w-0 md:col-span-4 lg:col-span-2 [&>*]:w-full">
            <HeroCard
              icon={HeartIcon}
              label="Likes"
              value={stats?.engagement.likes}
              accent="rose"
              delta={stats?.engagement.likesToday}
              deltaLabel="new today"
              pending={statsPending}
            />
          </div>
          <div className="col-span-6 min-w-0 md:col-span-4 lg:col-span-2 [&>*]:w-full">
            <HeroCard
              icon={ArrowPathIcon}
              label="Reposts"
              value={stats?.engagement.reposts}
              accent="emerald"
              pending={statsPending}
            />
          </div>
          <div className="col-span-6 min-w-0 md:col-span-4 lg:col-span-2 [&>*]:w-full">
            <HeroCard
              icon={BookmarkIcon}
              label="Bookmarks"
              value={stats?.engagement.bookmarks}
              accent="amber"
              pending={statsPending}
            />
          </div>
          <div className="col-span-6 min-w-0 md:col-span-4 lg:col-span-2 [&>*]:w-full">
            <HeroCard
              icon={EyeIcon}
              label="Impressions"
              value={stats?.posts.totalImpressions}
              accent="fuchsia"
              pending={statsPending}
            />
          </div>
          <div className="col-span-6 min-w-0 md:col-span-4 lg:col-span-2 [&>*]:w-full">
            <HeroCard
              icon={FlagIcon}
              label="Open reports"
              value={stats?.reports.open}
              accent="amber"
              pending={statsPending}
            />
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <Section title="Users" icon={UsersIcon} accent="sky">
              <MiniStat
                pending={statsPending}
                label="Total"
                value={stats?.users.total}
              />
              <MiniStat
                pending={statsPending}
                label="Active"
                value={stats?.users.active}
              />
              <MiniStat
                pending={statsPending}
                label="Verified"
                value={stats?.users.verified}
              />
              <MiniStat
                pending={statsPending}
                label="Admins"
                value={stats?.users.admins}
              />
              <MiniStat
                pending={statsPending}
                label="Banned"
                value={stats?.users.banned}
                tone="destructive"
              />
              <MiniStat
                pending={statsPending}
                label="Shadow"
                value={stats?.users.shadowBanned}
                tone="warning"
              />
              <MiniStat
                pending={statsPending}
                label="Deleted"
                value={stats?.users.deleted}
                tone="destructive"
              />
              <MiniStat
                pending={statsPending}
                label="New 24h"
                value={stats?.users.newToday}
                tone="positive"
              />
              <MiniStat
                pending={statsPending}
                label="New 7d"
                value={stats?.users.newThisWeek}
                tone="positive"
              />
            </Section>
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <Section title="Posts" icon={ChatBubbleLeftIcon} accent="violet">
              <MiniStat
                pending={statsPending}
                label="Total"
                value={stats?.posts.total}
              />
              <MiniStat
                pending={statsPending}
                label="Original"
                value={stats?.posts.original}
              />
              <MiniStat
                pending={statsPending}
                label="Replies"
                value={stats?.posts.replies}
              />
              <MiniStat
                pending={statsPending}
                label="Reposts"
                value={stats?.posts.reposts}
              />
              <MiniStat
                pending={statsPending}
                label="Quotes"
                value={stats?.posts.quotes}
              />
              <MiniStat
                pending={statsPending}
                label="Edited"
                value={stats?.posts.edited}
              />
              <MiniStat
                pending={statsPending}
                label="Sensitive"
                value={stats?.posts.sensitive}
                tone="warning"
              />
              <MiniStat
                pending={statsPending}
                label="Deleted"
                value={stats?.posts.deleted}
                tone="destructive"
              />
              <MiniStat
                pending={statsPending}
                label="New 24h"
                value={stats?.posts.newToday}
                tone="positive"
              />
              <MiniStat
                pending={statsPending}
                label="New 7d"
                value={stats?.posts.newThisWeek}
                tone="positive"
              />
            </Section>
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <Section title="Engagement" icon={HeartIcon} accent="rose">
              <MiniStat
                pending={statsPending}
                label="Likes"
                value={stats?.engagement.likes}
              />
              <MiniStat
                pending={statsPending}
                label="Likes 24h"
                value={stats?.engagement.likesToday}
                tone="positive"
              />
              <MiniStat
                pending={statsPending}
                label="Bookmarks"
                value={stats?.engagement.bookmarks}
              />
              <MiniStat
                pending={statsPending}
                label="Reposts"
                value={stats?.engagement.reposts}
              />
              <MiniStat
                pending={statsPending}
                label="Quotes"
                value={stats?.engagement.quotes}
              />
              <MiniStat
                pending={statsPending}
                label="Replies"
                value={stats?.engagement.replies}
              />
            </Section>
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <Section title="Reach" icon={EyeIcon} accent="fuchsia">
              <MiniStat
                pending={statsPending}
                label="Impressions"
                value={stats?.posts.totalImpressions}
              />
              <MiniStat
                pending={statsPending}
                label="Conversations"
                value={stats?.messaging.conversations}
              />
              <MiniStat
                pending={statsPending}
                label="Messages"
                value={stats?.messaging.messages}
              />
            </Section>
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <Section title="Social graph" icon={UserGroupIcon} accent="emerald">
              <MiniStat
                pending={statsPending}
                label="Follows"
                value={stats?.social.follows}
              />
              <MiniStat
                pending={statsPending}
                label="Follows 24h"
                value={stats?.social.followsToday}
                tone="positive"
              />
              <MiniStat
                pending={statsPending}
                label="Blocks"
                value={stats?.social.blocks}
                tone="destructive"
              />
              <MiniStat
                pending={statsPending}
                label="Mutes"
                value={stats?.social.mutes}
                tone="warning"
              />
            </Section>
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-6 [&>*]:w-full">
            <Section title="Reports" icon={FlagIcon} accent="amber">
              <MiniStat
                pending={statsPending}
                label="Total"
                value={stats?.reports.total}
              />
              <MiniStat
                pending={statsPending}
                label="Open"
                value={stats?.reports.open}
                tone="warning"
              />
              <MiniStat
                pending={statsPending}
                label="Triaged"
                value={stats?.reports.triaged}
              />
              <MiniStat
                pending={statsPending}
                label="Actioned"
                value={stats?.reports.actioned}
                tone="positive"
              />
              <MiniStat
                pending={statsPending}
                label="Dismissed"
                value={stats?.reports.dismissed}
              />
            </Section>
          </div>
        </div>
      </div>
    </PageFrame>
  )
}
