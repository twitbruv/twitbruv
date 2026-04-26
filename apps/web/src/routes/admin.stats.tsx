import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  BookmarkIcon,
  ChatCircleIcon,
  CircleIcon,
  EyeIcon,
  FlagIcon,
  HeartIcon,
  RepeatIcon,
  UsersIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"
import { api } from "../lib/api"
import { PageError } from "../components/page-surface"
import type { Icon } from "@phosphor-icons/react"
import type { AdminOnline, AdminStats } from "../lib/api"

// How often the admin dashboard refreshes the live online count. Tighter than the user-side
// presence heartbeat (30s) so the number ticks visibly instead of jumping in 30s steps.
const ONLINE_POLL_MS = 10_000

export const Route = createFileRoute("/admin/stats")({ component: AdminStatsPage })

// Tailwind palette tokens for each section. Listed verbatim so the JIT picks them up — building
// these strings dynamically would skip the safelist and the colours would silently disappear.
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
} as const
type AccentKey = keyof typeof ACCENT

const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const fullFormatter = new Intl.NumberFormat("en")

function formatStat(value: number | null | undefined, compact: boolean): string {
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
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className={`pointer-events-none absolute -right-6 -top-6 size-20 rounded-full opacity-60 blur-2xl ${a.bg}`} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        <span className={`flex size-7 items-center justify-center rounded-md ring-1 ${a.bg} ${a.text} ${a.ring}`}>
          <Icon className="size-4" weight="bold" />
        </span>
      </div>
      <p
        className={`relative mt-3 text-3xl font-semibold tabular-nums tracking-tight ${
          isLoading ? "text-muted-foreground" : ""
        }`}
        title={isLoading ? undefined : fullFormatter.format(value)}
      >
        {formatStat(value, true)}
      </p>
      {delta !== undefined && delta !== null && (
        <p className="relative mt-1 text-[11px] text-muted-foreground">
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
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-500"
        : tone === "positive"
          ? "text-emerald-600 dark:text-emerald-500"
          : ""
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5">
      <span className="truncate text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          isLoading ? "text-muted-foreground" : toneCls
        }`}
        title={isLoading ? undefined : fullFormatter.format(value)}
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
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`size-1 rounded-full ${a.bar}`} />
        <Icon className={`size-3.5 ${a.text}`} weight="bold" />
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-foreground uppercase">
          {title}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{children}</div>
    </div>
  )
}

function OnlineNow({ online }: { online: AdminOnline | null }) {
  const isLoading = online === null
  const count = online?.count ?? null
  const sample = online?.sample ?? []
  const shownSample = sample.slice(0, 8)
  const initials = (s: AdminOnline["sample"][number]) =>
    (s.displayName ?? s.handle ?? "?").trim().slice(0, 1).toUpperCase()
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4">
      <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-emerald-500/10 opacity-60 blur-2xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex size-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400">
            <CircleIcon className="size-3" weight="fill" />
            <span className="absolute inset-0 m-auto size-3 animate-ping rounded-full bg-emerald-500/40" />
          </span>
          <div>
            <p className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Online now
            </p>
            <p
              className={`text-2xl font-semibold tabular-nums tracking-tight ${
                isLoading ? "text-muted-foreground" : ""
              }`}
              title={count === null ? undefined : fullFormatter.format(count)}
            >
              {formatStat(count, true)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              tabs open in the last 90 seconds
            </p>
          </div>
        </div>
        {shownSample.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {shownSample.map((u) => (
                <span
                  key={u.id}
                  title={u.handle ? `@${u.handle}` : (u.displayName ?? u.id)}
                  className="inline-flex size-7 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground"
                >
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(u)
                  )}
                </span>
              ))}
            </div>
            {count !== null && count > shownSample.length && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                +{fullFormatter.format(count - shownSample.length)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [online, setOnline] = useState<AdminOnline | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .adminStats()
      .then((res) => {
        if (!cancelled) setStats(res)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Live online users. Polled only while the admin tab is visible — a tab opened in the
  // background never fires a visibilitychange until shown, so we have to gate the initial
  // tick on visibility too, otherwise a backgrounded admin tab would poll indefinitely.
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      api
        .adminOnline()
        .then((res) => {
          if (!cancelled) setOnline(res)
        })
        .catch(() => {
          // transient — leave the previous count in place rather than blanking the card
        })
    }
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      tick()
      timer = setInterval(tick, ONLINE_POLL_MS)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") start()
      else stop()
    }
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  if (error) {
    return (
      <main className="flex min-h-0 flex-1 flex-col">
        <PageError message={error} />
      </main>
    )
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain">
      <div className="space-y-4 bg-gradient-to-b from-muted/30 via-background to-background p-4">
        <OnlineNow online={online} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          <HeroCard
            icon={UsersIcon}
            label="Active users"
            value={stats?.users.active}
            accent="sky"
            delta={stats?.users.newToday}
            deltaLabel="new today"
          />
          <HeroCard
            icon={ChatCircleIcon}
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
            icon={RepeatIcon}
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
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section title="Users" icon={UsersIcon} accent="sky">
            <MiniStat label="Total" value={stats?.users.total} />
            <MiniStat label="Active" value={stats?.users.active} />
            <MiniStat label="Verified" value={stats?.users.verified} />
            <MiniStat label="Admins" value={stats?.users.admins} />
            <MiniStat label="Banned" value={stats?.users.banned} tone="destructive" />
            <MiniStat label="Shadow" value={stats?.users.shadowBanned} tone="warning" />
            <MiniStat label="Deleted" value={stats?.users.deleted} tone="destructive" />
            <MiniStat label="New 24h" value={stats?.users.newToday} tone="positive" />
            <MiniStat label="New 7d" value={stats?.users.newThisWeek} tone="positive" />
          </Section>

          <Section title="Posts" icon={ChatCircleIcon} accent="violet">
            <MiniStat label="Total" value={stats?.posts.total} />
            <MiniStat label="Original" value={stats?.posts.original} />
            <MiniStat label="Replies" value={stats?.posts.replies} />
            <MiniStat label="Reposts" value={stats?.posts.reposts} />
            <MiniStat label="Quotes" value={stats?.posts.quotes} />
            <MiniStat label="Edited" value={stats?.posts.edited} />
            <MiniStat label="Sensitive" value={stats?.posts.sensitive} tone="warning" />
            <MiniStat label="Deleted" value={stats?.posts.deleted} tone="destructive" />
            <MiniStat label="New 24h" value={stats?.posts.newToday} tone="positive" />
          </Section>

          <Section title="Engagement" icon={HeartIcon} accent="rose">
            <MiniStat label="Likes" value={stats?.engagement.likes} />
            <MiniStat label="Likes 24h" value={stats?.engagement.likesToday} tone="positive" />
            <MiniStat label="Bookmarks" value={stats?.engagement.bookmarks} />
            <MiniStat label="Reposts" value={stats?.engagement.reposts} />
            <MiniStat label="Quotes" value={stats?.engagement.quotes} />
            <MiniStat label="Replies" value={stats?.engagement.replies} />
          </Section>

          <Section title="Reach" icon={EyeIcon} accent="fuchsia">
            <MiniStat label="Impressions" value={stats?.posts.totalImpressions} />
            <MiniStat label="Conversations" value={stats?.messaging.conversations} />
            <MiniStat label="Messages" value={stats?.messaging.messages} />
          </Section>

          <Section title="Social graph" icon={UsersThreeIcon} accent="emerald">
            <MiniStat label="Follows" value={stats?.social.follows} />
            <MiniStat label="Follows 24h" value={stats?.social.followsToday} tone="positive" />
            <MiniStat label="Blocks" value={stats?.social.blocks} tone="destructive" />
            <MiniStat label="Mutes" value={stats?.social.mutes} tone="warning" />
          </Section>

          <Section title="Reports" icon={FlagIcon} accent="amber">
            <MiniStat label="Total" value={stats?.reports.total} />
            <MiniStat label="Open" value={stats?.reports.open} tone="warning" />
            <MiniStat label="Triaged" value={stats?.reports.triaged} />
            <MiniStat label="Actioned" value={stats?.reports.actioned} tone="positive" />
            <MiniStat label="Dismissed" value={stats?.reports.dismissed} />
          </Section>
        </div>
      </div>
    </main>
  )
}
