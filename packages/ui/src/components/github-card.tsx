import {
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  CommandLineIcon,
  PencilSquareIcon,
  StarIcon,
} from "@heroicons/react/16/solid"
import { LANGUAGE_COLORS } from "@workspace/github-unfurl/language-colors"
import { cn } from "../lib/utils"
import { Badge } from "./badge"
import { LinkCardShell } from "./link-card"

function compactNumber(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function GithubChromeHeader({ repoLabel }: { repoLabel: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-neutral bg-base-2/60 px-3 py-1.5 text-sm text-tertiary">
      <GithubMark className="size-3.5" />
      <span className="truncate">{repoLabel}</span>
    </div>
  )
}

const badgeClass = "rounded-full uppercase tracking-wide gap-1"

// ── Repo ──────────────────────────────────────────────

export interface GithubRepoCardProps {
  url: string
  nameWithOwner: string
  description?: string | null
  stars: number
  forks: number
  primaryLanguage?: { name: string; color: string | null } | null
  topics: Array<string>
  isPrivate?: boolean
  isArchived?: boolean
  isFork?: boolean
  ownerAvatarUrl?: string | null
  className?: string
}

export function GithubRepoCard({
  url,
  nameWithOwner,
  description,
  stars,
  forks,
  primaryLanguage,
  topics,
  isPrivate,
  isArchived,
  isFork,
  ownerAvatarUrl,
  className,
}: GithubRepoCardProps) {
  return (
    <LinkCardShell href={url} className={className}>
      <GithubChromeHeader
        repoLabel={nameWithOwner.split("/")[0] ?? nameWithOwner}
      />
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          {ownerAvatarUrl && (
            <img
              src={ownerAvatarUrl}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              className="size-5 shrink-0 rounded-full"
            />
          )}
          <h3 className="truncate text-sm font-semibold text-primary">
            {nameWithOwner.split("/")[1] ?? nameWithOwner}
          </h3>
          {isArchived && <Badge className={badgeClass}>archived</Badge>}
          {isFork && <Badge className={badgeClass}>fork</Badge>}
          {isPrivate && <Badge className={badgeClass}>private</Badge>}
        </div>
        {description && (
          <p className="line-clamp-2 text-sm text-tertiary">{description}</p>
        )}
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topics.slice(0, 6).map((t) => (
              <Badge key={t} className="rounded-full">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-tertiary">
          {primaryLanguage && (
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{
                  backgroundColor:
                    primaryLanguage.color ??
                    LANGUAGE_COLORS[primaryLanguage.name] ??
                    "currentColor",
                }}
              />
              {primaryLanguage.name}
            </span>
          )}
          {stars > 0 && (
            <span className="inline-flex items-center gap-1">
              <StarIcon className="size-3.5 shrink-0" />
              {compactNumber(stars)}
            </span>
          )}
          {forks > 0 && (
            <span className="inline-flex items-center gap-1">
              <ArrowsRightLeftIcon className="size-3.5 shrink-0" />
              {compactNumber(forks)}
            </span>
          )}
        </div>
      </div>
    </LinkCardShell>
  )
}

// ── Issue ─────────────────────────────────────────────

export interface GithubIssueCardProps {
  url: string
  owner: string
  repo: string
  number: number
  title: string
  state: "open" | "closed"
  stateReason?: string | null
  authorLogin?: string | null
  authorAvatarUrl?: string | null
  comments: number
  excerpt?: string | null
  labels: Array<{ name: string; color: string | null }>
  className?: string
}

export function GithubIssueCard({
  url,
  owner,
  repo: _repo,
  number: num,
  title,
  state,
  stateReason,
  authorLogin,
  authorAvatarUrl: _authorAvatarUrl,
  comments,
  excerpt,
  labels,
  className,
}: GithubIssueCardProps) {
  return (
    <LinkCardShell href={url} className={className}>
      <GithubChromeHeader repoLabel={owner} />
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          {state === "open" ? (
            <Badge variant="success" className={badgeClass}>
              open
            </Badge>
          ) : (
            <Badge variant="danger" className={badgeClass}>
              {stateReason === "not_planned" ? "not planned" : "closed"}
            </Badge>
          )}
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-primary">
            {title}
          </h3>
        </div>
        {excerpt && (
          <p className="line-clamp-2 text-sm text-tertiary">{excerpt}</p>
        )}
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.slice(0, 5).map((l) => (
              <Badge key={l.name} color={l.color} className="rounded-full">
                {l.name}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-tertiary">
          <span>#{num}</span>
          {authorLogin && <span>by @{authorLogin}</span>}
          {comments > 0 && <span>{comments} comments</span>}
        </div>
      </div>
    </LinkCardShell>
  )
}

// ── Pull Request ──────────────────────────────────────

export interface GithubPullCardProps {
  url: string
  owner: string
  repo: string
  number: number
  title: string
  state: "open" | "closed" | "merged"
  draft: boolean
  authorLogin?: string | null
  authorAvatarUrl?: string | null
  headRef: string
  baseRef: string
  additions: number
  deletions: number
  changedFiles: number
  excerpt?: string | null
  className?: string
}

export function GithubPullCard({
  url,
  owner,
  repo: _repo,
  number: num,
  title,
  state,
  draft,
  authorLogin,
  authorAvatarUrl: _authorAvatarUrl,
  headRef,
  baseRef,
  additions,
  deletions,
  changedFiles,
  excerpt,
  className,
}: GithubPullCardProps) {
  let badge: React.ReactNode
  if (state === "merged") {
    badge = (
      <Badge variant="merged" className={badgeClass}>
        <ArrowPathRoundedSquareIcon className="size-3" />
        merged
      </Badge>
    )
  } else if (state === "closed") {
    badge = (
      <Badge variant="danger" className={badgeClass}>
        closed
      </Badge>
    )
  } else if (draft) {
    badge = (
      <Badge className={badgeClass}>
        <PencilSquareIcon className="size-3" />
        draft
      </Badge>
    )
  } else {
    badge = (
      <Badge variant="success" className={badgeClass}>
        <ArrowsRightLeftIcon className="size-3" />
        open
      </Badge>
    )
  }

  return (
    <LinkCardShell href={url} className={className}>
      <GithubChromeHeader repoLabel={owner} />
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          {badge}
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-primary">
            {title}
          </h3>
        </div>
        {excerpt && (
          <p className="line-clamp-2 text-sm text-tertiary">{excerpt}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tertiary">
          <span>#{num}</span>
          {authorLogin && <span>by @{authorLogin}</span>}
          <span className="flex items-center gap-1 font-mono">
            <ArrowsRightLeftIcon className="size-3 shrink-0" />
            <span className="max-w-[110px] truncate">{headRef}</span>
            <span className="opacity-60">→</span>
            <span className="max-w-[110px] truncate">{baseRef}</span>
          </span>
          {(additions > 0 || deletions > 0) && (
            <span className="font-mono">
              <span className="text-success">+{compactNumber(additions)}</span>{" "}
              <span className="text-danger">−{compactNumber(deletions)}</span>
            </span>
          )}
          {changedFiles > 0 && <span>{changedFiles} files</span>}
        </div>
      </div>
    </LinkCardShell>
  )
}

// ── Commit ────────────────────────────────────────────

export interface GithubCommitCardProps {
  url: string
  owner: string
  repo: string
  shortSha: string
  messageHeadline: string
  messageBody?: string | null
  authorLogin?: string | null
  authorAvatarUrl?: string | null
  authorName?: string | null
  additions: number
  deletions: number
  changedFiles: number
  className?: string
}

export function GithubCommitCard({
  url,
  owner,
  repo: _repo,
  shortSha,
  messageHeadline,
  messageBody,
  authorLogin,
  authorAvatarUrl: _authorAvatarUrl,
  authorName,
  additions,
  deletions,
  changedFiles,
  className,
}: GithubCommitCardProps) {
  return (
    <LinkCardShell href={url} className={className}>
      <GithubChromeHeader repoLabel={owner} />
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <Badge className={cn(badgeClass, "font-mono")}>
            <CommandLineIcon className="size-3 shrink-0" />
            {shortSha}
          </Badge>
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-primary">
            {messageHeadline}
          </h3>
        </div>
        {messageBody && (
          <pre className="line-clamp-2 font-mono text-sm whitespace-pre-wrap text-tertiary">
            {messageBody}
          </pre>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tertiary">
          {(authorLogin || authorName) && (
            <span>by {authorLogin ? `@${authorLogin}` : authorName}</span>
          )}
          {(additions > 0 || deletions > 0) && (
            <span className="font-mono">
              <span className="text-success">+{compactNumber(additions)}</span>{" "}
              <span className="text-danger">−{compactNumber(deletions)}</span>
            </span>
          )}
          {changedFiles > 0 && <span>{changedFiles} files</span>}
        </div>
      </div>
    </LinkCardShell>
  )
}
