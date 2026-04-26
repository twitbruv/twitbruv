import { useEffect, useState } from "react"
import { ApiError, api } from "../lib/api"
import type {
  GithubContributions,
  GithubPinnedRepo,
  GithubProfilePayload,
} from "../lib/api"

interface Props {
  handle: string
}

export function GithubBlock({ handle }: Props) {
  const [data, setData] = useState<GithubProfilePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    api
      .userGithub(handle)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "load_failed")
      })
    return () => {
      cancelled = true
    }
  }, [handle])

  if (error) return null
  if (!data || !data.connected) return null

  return (
    <section className="border-t border-border px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-medium text-muted-foreground">
          GitHub
          <span className="ml-2 text-foreground">
            <a
              href={data.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              @{data.login}
            </a>
          </span>
        </h2>
        <div className="text-xs text-muted-foreground">
          <span className="tabular-nums font-medium text-foreground">
            {data.contributions.totalContributions.toLocaleString()}
          </span>{" "}
          contributions in the last year
          {data.stale && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wider">
              · cached
            </span>
          )}
        </div>
      </div>

      <ContributionsHeatmap data={data.contributions} className="mt-3" />

      {data.pinned.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.pinned.map((repo) => (
            <PinnedRepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </section>
  )
}

function ContributionsHeatmap({
  data,
  className,
}: {
  data: GithubContributions
  className?: string
}) {
  // Layout constants — tuned to match GitHub's visual density at a glance. The grid is
  // weeks-by-days (cols = 53 max, rows = 7); each cell is a square rect with a rounded
  // corner. Total width is intrinsic from week count so we don't need responsive sizing.
  const cell = 11
  const gap = 2
  const cols = data.weeks.length
  const rows = 7
  const width = cols * (cell + gap) - gap
  const height = rows * (cell + gap) - gap

  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="GitHub contributions over the last year"
        className="block"
      >
        {data.weeks.map((week, wi) =>
          week.days.map((day) => {
            const di = new Date(day.date).getUTCDay()
            return (
              <rect
                key={`${wi}-${day.date}`}
                x={wi * (cell + gap)}
                y={di * (cell + gap)}
                width={cell}
                height={cell}
                rx={2}
                ry={2}
                fill={day.count > 0 ? day.color : "var(--color-muted)"}
                opacity={day.count > 0 ? 1 : 0.55}
              >
                <title>{`${day.count} on ${day.date}`}</title>
              </rect>
            )
          })
        )}
      </svg>
    </div>
  )
}

function PinnedRepoCard({ repo }: { repo: GithubPinnedRepo }) {
  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-md border border-border bg-background px-3 py-2 hover:bg-muted/40"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <span className="truncate">{repo.name}</span>
      </div>
      {repo.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {repo.description}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        {repo.primaryLanguage && (
          <span className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{
                backgroundColor: repo.primaryLanguage.color ?? "currentColor",
              }}
            />
            {repo.primaryLanguage.name}
          </span>
        )}
        {repo.stars > 0 && <span>★ {repo.stars}</span>}
        {repo.forks > 0 && <span>⑂ {repo.forks}</span>}
      </div>
    </a>
  )
}
