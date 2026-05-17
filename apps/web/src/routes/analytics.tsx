import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  BoltIcon,
  BookmarkIcon,
  ChatBubbleLeftIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  EyeIcon,
  HeartIcon,
  UserCircleIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/solid"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
import { PageFrame } from "../components/page-frame"
import { PageError, PageLoading } from "../components/page-surface"
import type { ReactNode } from "react"
import type { AnalyticsOverview, Post } from "../lib/api"

export const Route = createFileRoute("/analytics")({ component: Analytics })

function formatPostAge(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const dd = Math.floor(h / 24)
  if (dd < 7) return `${dd}d ago`
  return new Date(iso).toLocaleDateString()
}

function useDenseDailySeries(
  points: Array<{ day: string; n: number }>,
  days: number
) {
  return useMemo(() => {
    const byDay = new Map(points.map((p) => [p.day, p.n]))
    const out: Array<{ day: string; n: number }> = []
    const today = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      out.push({ day: key, n: byDay.get(key) ?? 0 })
    }
    return out
  }, [points, days])
}

function DailySparkline({
  series,
  emptyLabel,
}: {
  series: Array<{ day: string; n: number }>
  emptyLabel: string
}) {
  if (series.every((s) => s.n === 0)) {
    return <p className="mt-3 text-xs text-tertiary">{emptyLabel}</p>
  }

  const width = 600
  const height = 80
  const padTop = 4
  const max = Math.max(1, ...series.map((s) => s.n))
  const step = width / Math.max(1, series.length - 1)
  const last = series[series.length - 1]
  const total = series.reduce((acc, s) => acc + s.n, 0)
  const peak = series.reduce((best, s) => (s.n > best.n ? s : best), series[0])

  const linePts = series
    .map(
      (s, i) =>
        `${i * step},${height - (s.n / max) * (height - padTop) - padTop / 2}`
    )
    .join(" ")
  const areaPath = `M 0,${height} L ${linePts.replaceAll(" ", " L ")} L ${width},${height} Z`

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-20 w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={areaPath} className="fill-primary/10" />
        <polyline
          points={linePts}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-tertiary tabular-nums">
        <span>
          Peak {peak.n.toLocaleString()}
          {peak.day ? ` · ${formatDayShort(peak.day)}` : ""}
        </span>
        <span>
          Total {total.toLocaleString()} · today {last.n.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

function formatDayShort(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return day
  const year = Number(match[1])
  const month = Number(match[2])
  const dayOfMonth = Number(match[3])
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(dayOfMonth)
  ) {
    return day
  }
  const d = new Date(year, month - 1, dayOfMonth)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function Analytics() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  const [days, setDays] = useState(28)

  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const {
    data: overview,
    error: overviewErr,
    isPending: overviewPending,
  } = useQuery({
    queryKey: qk.analytics(days),
    queryFn: () => api.analyticsOverview(days),
    enabled: !!session,
  })

  const error = overviewErr instanceof Error ? overviewErr.message : null

  const onDays = useCallback((v: string | null) => {
    if (v == null) return
    setDays(Number(v))
  }, [])

  const appHeader = useMemo(
    () => ({
      title: "Analytics" as const,
      action: (
        <Select value={String(days)} onValueChange={onDays}>
          <SelectTrigger
            size="sm"
            className="h-8 w-full min-w-[8rem] sm:w-auto"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="28">Last 28 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      ),
    }),
    [days, onDays]
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      {error && <PageError message={error} />}
      {overviewPending && !error && <PageLoading label="Loading…" />}

      {overview ? <AnalyticsLoaded data={overview} days={days} /> : null}
    </PageFrame>
  )
}

function AnalyticsLoaded({
  data,
  days,
}: {
  data: AnalyticsOverview
  days: number
}) {
  const followerSeries = useDenseDailySeries(
    data.followerGrowth.map((p) => ({ day: p.day, n: p.newFollowers })),
    data.period.days || days
  )
  const impressionSeries = useDenseDailySeries(
    data.impressionsByDay.map((p) => ({ day: p.day, n: p.count })),
    data.period.days || days
  )

  const engagementTotal = data.totals.engagements

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <section>
        <h2 className="text-sm font-semibold">Audience and reach</h2>
        <p className="text-xs text-tertiary">
          Follower and following totals are current; new-follower counts use
          only the selected window.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SnapshotCard
            icon={<UsersIcon className="size-[18px]" />}
            label="Followers"
            value={data.snapshot.followerCount.toLocaleString()}
            hint={`+${data.totals.newFollowers.toLocaleString()} this period`}
          />
          <SnapshotCard
            icon={<UserCircleIcon className="size-[18px]" />}
            label="Following"
            value={data.snapshot.followingCount.toLocaleString()}
            hint="Accounts you follow"
          />
          <SnapshotCard
            icon={<UserPlusIcon className="size-[18px]" />}
            label="New followers"
            value={data.totals.newFollowers.toLocaleString()}
            hint="First-time follows in this window"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Content you published</h2>
        <p className="text-xs text-tertiary">
          Posts and articles first published during the window (reposts counted
          separately).
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SnapshotCard
            icon={<ChatBubbleLeftIcon className="size-[18px]" />}
            label="Original posts"
            value={data.snapshot.originalPosts.toLocaleString()}
            hint="Excludes repost rows"
          />
          <SnapshotCard
            icon={<ArrowPathIcon className="size-[18px]" />}
            label="Reposts"
            value={data.snapshot.repostsAuthored.toLocaleString()}
            hint="Shares of other people's posts"
          />
          <SnapshotCard
            icon={<DocumentTextIcon className="size-[18px]" />}
            label="Articles published"
            value={data.snapshot.articlesPublished.toLocaleString()}
            hint="Long-form pieces went live"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          icon={<EyeIcon className="size-[18px]" />}
          label="Impressions"
          value={data.totals.impressions}
          hint="Feed or profile surfaces of your posts (client-reported)"
        />
        <Stat
          icon={<BoltIcon className="size-[18px]" />}
          label="Engagements"
          value={data.totals.engagements}
          hint="Likes, reposts, replies, bookmarks, quotes on your posts"
        />
        <Stat
          icon={<ArrowTrendingUpIcon className="size-[18px]" />}
          label="Engagement rate"
          value={`${(data.totals.engagementRate * 100).toFixed(1)}%`}
          hint={
            data.totals.impressions === 0
              ? "No impressions yet in this window"
              : `${data.totals.engagements.toLocaleString()} ÷ ${data.totals.impressions.toLocaleString()} impressions`
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-neutral p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <EyeIcon className="size-4 text-tertiary" />
            Impressions per day
          </h2>
          <p className="text-xs text-tertiary">
            How often your posts were surfaced to viewers (same source as
            headline impressions).
          </p>
          <DailySparkline
            series={impressionSeries}
            emptyLabel="No impressions recorded in this period."
          />
        </section>
        <section className="rounded-md border border-neutral p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserPlusIcon className="size-4 text-tertiary" />
            New follows per day
          </h2>
          <p className="text-xs text-tertiary">
            New followers only; unfollows are not subtracted here.
          </p>
          <DailySparkline
            series={followerSeries}
            emptyLabel="No new followers in this period."
          />
        </section>
      </div>

      <section className="rounded-md border border-neutral">
        <header className="border-b border-neutral px-4 py-3">
          <h2 className="text-sm font-semibold">Engagement breakdown</h2>
          <p className="text-xs text-tertiary">
            Actions others took on your posts in this window. Share shows
            fraction of total engagements.
          </p>
        </header>
        <ul className="divide-y divide-neutral px-4 py-1">
          <BreakdownRow
            icon={<HeartIcon className="size-4 shrink-0" />}
            label="Likes"
            value={data.totals.likes}
            share={
              engagementTotal > 0 ? data.totals.likes / engagementTotal : 0
            }
          />
          <BreakdownRow
            icon={<ArrowPathIcon className="size-4 shrink-0" />}
            label="Reposts"
            value={data.totals.reposts}
            share={
              engagementTotal > 0 ? data.totals.reposts / engagementTotal : 0
            }
          />
          <BreakdownRow
            icon={<ChatBubbleLeftIcon className="size-4 shrink-0" />}
            label="Replies"
            value={data.totals.replies}
            share={
              engagementTotal > 0 ? data.totals.replies / engagementTotal : 0
            }
          />
          <BreakdownRow
            icon={<ChatBubbleLeftRightIcon className="size-4 shrink-0" />}
            label="Quotes"
            value={data.totals.quotes}
            share={
              engagementTotal > 0 ? data.totals.quotes / engagementTotal : 0
            }
          />
          <BreakdownRow
            icon={<BookmarkIcon className="size-4 shrink-0" />}
            label="Bookmarks"
            value={data.totals.bookmarks}
            share={
              engagementTotal > 0 ? data.totals.bookmarks / engagementTotal : 0
            }
          />
        </ul>
        {engagementTotal === 0 && (
          <p className="border-t border-neutral px-4 py-3 text-xs text-tertiary">
            No engagements in this window yet. Posting publicly and getting
            replies or likes will populate this section.
          </p>
        )}
      </section>

      <section className="rounded-md border border-neutral">
        <header className="border-b border-neutral px-4 py-3">
          <h2 className="text-sm font-semibold">Top posts</h2>
          <p className="text-xs text-tertiary">
            Your posts from this period, ranked by lifetime engagement counters
            (likes, reposts, replies, bookmarks, quotes).
          </p>
        </header>
        {data.topPosts.length === 0 ? (
          <p className="p-4 text-sm text-tertiary">
            No posts in this period yet.
          </p>
        ) : (
          <ul>
            {data.topPosts.map((p) => (
              <TopPostRow key={p.id} post={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SnapshotCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="flex gap-3 rounded-md border border-neutral p-3 transition-colors hover:bg-base-2/30">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-subtle text-secondary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-tertiary">{label}</div>
        <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
        <p className="mt-1 text-[11px] leading-snug text-tertiary">{hint}</p>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: number | string
  hint?: string
}) {
  return (
    <div className="flex gap-3 rounded-md border border-neutral p-3 transition-colors hover:bg-base-2/30">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-subtle text-secondary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-tertiary">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {hint && (
          <div className="mt-1 text-[11px] leading-snug text-tertiary">
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

function BreakdownRow({
  icon,
  label,
  value,
  share,
}: {
  icon: React.ReactNode
  label: string
  value: number
  share: number
}) {
  const pct = Math.round(share * 1000) / 10
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-secondary">{icon}</span>
        <span className="text-sm text-secondary">{label}</span>
      </div>
      <div className="flex w-full flex-col items-stretch gap-1 sm:w-48 sm:items-end">
        <span className="text-sm font-semibold tabular-nums sm:text-right">
          {value.toLocaleString()}
          <span className="ml-2 text-xs font-normal text-tertiary">
            {value === 0 ? "0%" : `${pct}%`}
          </span>
        </span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle sm:max-w-[12rem]">
          <div
            className="h-full rounded-full bg-inverse transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>
    </li>
  )
}

function TopPostRow({ post: p }: { post: Post }) {
  const total =
    p.counts.likes +
    p.counts.reposts +
    p.counts.replies +
    p.counts.bookmarks +
    p.counts.quotes
  const excerpt =
    p.text.trim().length > 0
      ? p.text.trim().slice(0, 140) + (p.text.length > 140 ? "…" : "")
      : p.media && p.media.length > 0
        ? `[${p.media.length} image${p.media.length > 1 ? "s" : ""}]`
        : "—"
  const path = p.author.handle
    ? {
        to: "/$handle/p/$id" as const,
        params: { handle: p.author.handle, id: p.id },
      }
    : null

  return (
    <li className="flex flex-col gap-3 border-t border-neutral px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        {path ? (
          <Link {...path} className="text-sm leading-snug hover:underline">
            {excerpt}
          </Link>
        ) : (
          <span className="text-sm leading-snug">{excerpt}</span>
        )}
        <p className="mt-1 text-xs text-tertiary">
          {formatPostAge(p.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <HeartIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.likes}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowPathIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.reposts}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ChatBubbleLeftIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.replies}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookmarkIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.bookmarks}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ChatBubbleLeftRightIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.quotes}</span>
          </span>
        </div>
      </div>
      <div className="shrink-0 border-neutral sm:border-l sm:pl-4 sm:text-right">
        <div className="text-sm font-semibold tabular-nums">
          {total.toLocaleString()}
        </div>
        <div className="text-xs text-tertiary">engagement</div>
      </div>
    </li>
  )
}
