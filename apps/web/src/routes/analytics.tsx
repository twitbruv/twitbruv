import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  ArticleIcon,
  BookmarkIcon,
  ChatCircleIcon,
  EyeIcon,
  HeartIcon,
  LightningIcon,
  QuotesIcon,
  RepeatIcon,
  TrendUpIcon,
  UserCircleIcon,
  UserPlusIcon,
  UsersIcon,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { api } from "../lib/api"
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
  series: Array<{ n: number }>
  emptyLabel: string
}) {
  if (series.every((s) => s.n === 0)) {
    return <p className="mt-3 text-xs text-muted-foreground">{emptyLabel}</p>
  }

  const width = 600
  const height = 80
  const max = Math.max(1, ...series.map((s) => s.n))
  const step = width / Math.max(1, series.length - 1)
  const pts = series
    .map((s, i) => `${i * step},${height - (s.n / max) * height}`)
    .join(" ")

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-20 w-full"
      preserveAspectRatio="none"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-primary"
      />
    </svg>
  )
}

function Analytics() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(28)

  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  useEffect(() => {
    if (!session) return
    setData(null)
    setError(null)
    api
      .analyticsOverview(days)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load"))
  }, [session, days])

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
      <main>
        {error && <PageError message={error} />}
        {!data && !error && <PageLoading label="Loading…" />}

        {data ? <AnalyticsLoaded data={data} days={days} /> : null}
      </main>
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
        <p className="text-xs text-muted-foreground">
          Follower and following totals are current; new-follower counts use
          only the selected window.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SnapshotCard
            icon={<UsersIcon size={18} />}
            label="Followers"
            value={data.snapshot.followerCount.toLocaleString()}
            hint={`+${data.totals.newFollowers.toLocaleString()} this period`}
          />
          <SnapshotCard
            icon={<UserCircleIcon size={18} />}
            label="Following"
            value={data.snapshot.followingCount.toLocaleString()}
            hint="Accounts you follow"
          />
          <SnapshotCard
            icon={<UserPlusIcon size={18} />}
            label="New followers"
            value={data.totals.newFollowers.toLocaleString()}
            hint="First-time follows in this window"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Content you published</h2>
        <p className="text-xs text-muted-foreground">
          Posts and articles first published during the window (reposts counted
          separately).
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SnapshotCard
            icon={<ChatCircleIcon size={18} />}
            label="Original posts"
            value={data.snapshot.originalPosts.toLocaleString()}
            hint="Excludes repost rows"
          />
          <SnapshotCard
            icon={<RepeatIcon size={18} />}
            label="Reposts"
            value={data.snapshot.repostsAuthored.toLocaleString()}
            hint="Shares of other people's posts"
          />
          <SnapshotCard
            icon={<ArticleIcon size={18} />}
            label="Articles published"
            value={data.snapshot.articlesPublished.toLocaleString()}
            hint="Long-form pieces went live"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          icon={<EyeIcon size={18} />}
          label="Impressions"
          value={data.totals.impressions}
          hint="Feed or profile surfaces of your posts (client-reported)"
        />
        <Stat
          icon={<LightningIcon size={18} />}
          label="Engagements"
          value={data.totals.engagements}
          hint="Likes, reposts, replies, bookmarks, quotes on your posts"
        />
        <Stat
          icon={<TrendUpIcon size={18} />}
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
        <section className="rounded-md border border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <EyeIcon size={16} className="text-muted-foreground" />
            Impressions per day
          </h2>
          <p className="text-xs text-muted-foreground">
            How often your posts were surfaced to viewers (same source as
            headline impressions).
          </p>
          <DailySparkline
            series={impressionSeries}
            emptyLabel="No impressions recorded in this period."
          />
        </section>
        <section className="rounded-md border border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserPlusIcon size={16} className="text-muted-foreground" />
            New follows per day
          </h2>
          <p className="text-xs text-muted-foreground">
            New followers only; unfollows are not subtracted here.
          </p>
          <DailySparkline
            series={followerSeries}
            emptyLabel="No new followers in this period."
          />
        </section>
      </div>

      <section className="rounded-md border border-border">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Engagement breakdown</h2>
          <p className="text-xs text-muted-foreground">
            Actions others took on your posts in this window. Share shows
            fraction of total engagements.
          </p>
        </header>
        <ul className="divide-y divide-border px-4 py-1">
          <BreakdownRow
            icon={<HeartIcon className="size-4 shrink-0" />}
            label="Likes"
            value={data.totals.likes}
            share={
              engagementTotal > 0 ? data.totals.likes / engagementTotal : 0
            }
          />
          <BreakdownRow
            icon={<RepeatIcon className="size-4 shrink-0" />}
            label="Reposts"
            value={data.totals.reposts}
            share={
              engagementTotal > 0 ? data.totals.reposts / engagementTotal : 0
            }
          />
          <BreakdownRow
            icon={<ChatCircleIcon className="size-4 shrink-0" />}
            label="Replies"
            value={data.totals.replies}
            share={
              engagementTotal > 0 ? data.totals.replies / engagementTotal : 0
            }
          />
          <BreakdownRow
            icon={<QuotesIcon className="size-4 shrink-0" />}
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
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            No engagements in this window yet. Posting publicly and getting
            replies or likes will populate this section.
          </p>
        )}
      </section>

      <section className="rounded-md border border-border">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Top posts</h2>
          <p className="text-xs text-muted-foreground">
            Your posts from this period, ranked by lifetime engagement counters
            (likes, reposts, replies, bookmarks, quotes).
          </p>
        </header>
        {data.topPosts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
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
    <div className="flex gap-3 rounded-md border border-border p-3">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
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
    <div className="flex gap-2 rounded-md border border-border p-3">
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {hint && (
          <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
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
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex w-full flex-col items-stretch gap-1 sm:w-48 sm:items-end">
        <span className="text-sm font-semibold tabular-nums sm:text-right">
          {value.toLocaleString()}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {value === 0 ? "0%" : `${pct}%`}
          </span>
        </span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted sm:max-w-[12rem]">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
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
    <li className="flex flex-col gap-3 border-t border-border px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        {path ? (
          <Link {...path} className="text-sm leading-snug hover:underline">
            {excerpt}
          </Link>
        ) : (
          <span className="text-sm leading-snug">{excerpt}</span>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatPostAge(p.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <HeartIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.likes}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RepeatIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.reposts}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ChatCircleIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.replies}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookmarkIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.bookmarks}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <QuotesIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs tabular-nums">{p.counts.quotes}</span>
          </span>
        </div>
      </div>
      <div className="shrink-0 border-border sm:border-l sm:pl-4 sm:text-right">
        <div className="text-sm font-semibold tabular-nums">
          {total.toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground">engagement</div>
      </div>
    </li>
  )
}
