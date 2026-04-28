import {
  ArrowsRightLeftIcon,
  ArrowPathRoundedSquareIcon,
  CommandLineIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline"
import { cn } from "@workspace/ui/lib/utils"
import type { GithubCard } from "@workspace/github-unfurl/card"

interface Props {
  card: GithubCard
  className?: string
}

export function GithubCardBlock({ card, className }: Props) {
  switch (card.kind) {
    case "github_repo":
      return <RepoCard card={card} className={className} />
    case "github_issue":
      return <IssueCard card={card} className={className} />
    case "github_pull":
      return <PullCard card={card} className={className} />
    case "github_commit":
      return <CommitCard card={card} className={className} />
  }
}

function CardChrome({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-post-card-ignore-open
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "mt-3 block max-w-[560px] overflow-hidden rounded-lg border border-neutral bg-base-1 transition-all hover:bg-base-2/60 hover:shadow-sm",
        className
      )}
    >
      {children}
    </a>
  )
}

function GithubChromeHeader({
  repoLabel,
  ownerAvatarUrl,
}: {
  repoLabel: string
  ownerAvatarUrl?: string | null
}) {
  return (
    <div className="flex items-center gap-2 border-b border-neutral bg-base-2/60 px-3 py-1.5 text-[11px] text-tertiary">
      <GithubMark className="size-3.5" />
      {ownerAvatarUrl && (
        <img
          src={ownerAvatarUrl}
          alt=""
          width={14}
          height={14}
          loading="lazy"
          className="size-3.5 rounded-full"
        />
      )}
      <span className="truncate">{repoLabel}</span>
    </div>
  )
}

function RepoCard({
  card,
  className,
}: {
  card: Extract<GithubCard, { kind: "github_repo" }>
  className?: string
}) {
  return (
    <CardChrome href={card.url} className={className}>
      <GithubChromeHeader
        repoLabel={card.nameWithOwner}
        ownerAvatarUrl={card.ownerAvatarUrl}
      />
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-primary">
            {card.nameWithOwner}
          </h3>
          {card.isArchived && <Badge tone="neutral">archived</Badge>}
          {card.isFork && <Badge tone="neutral">fork</Badge>}
          {card.isPrivate && <Badge tone="neutral">private</Badge>}
        </div>
        {card.description && (
          <p className="line-clamp-2 text-[13px] text-tertiary">
            {card.description}
          </p>
        )}
        {card.topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.topics.slice(0, 6).map((t) => (
              <span
                key={t}
                className="rounded-full bg-base-2 px-2 py-px text-[10.5px] text-tertiary"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 text-[11.5px] text-tertiary">
          {card.primaryLanguage && (
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{
                  backgroundColor: card.primaryLanguage.color ?? "currentColor",
                }}
              />
              {card.primaryLanguage.name}
            </span>
          )}
          {card.stars > 0 && <span>★ {compactNumber(card.stars)}</span>}
          {card.forks > 0 && <span>⑂ {compactNumber(card.forks)}</span>}
        </div>
      </div>
    </CardChrome>
  )
}

function IssueCard({
  card,
  className,
}: {
  card: Extract<GithubCard, { kind: "github_issue" }>
  className?: string
}) {
  return (
    <CardChrome href={card.url} className={className}>
      <GithubChromeHeader
        repoLabel={`${card.owner}/${card.repo}`}
        ownerAvatarUrl={card.authorAvatarUrl}
      />
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <IssueStateBadge state={card.state} stateReason={card.stateReason} />
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-primary">
            {card.title}
          </h3>
        </div>
        {card.excerpt && (
          <p className="line-clamp-2 text-[13px] text-tertiary">
            {card.excerpt}
          </p>
        )}
        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.labels.slice(0, 5).map((l) => (
              <span
                key={l.name}
                className="rounded-full px-2 py-px text-[10.5px] font-medium"
                style={{
                  backgroundColor: l.color ? `#${l.color}22` : undefined,
                  color: l.color ? `#${l.color}` : undefined,
                  border: l.color ? `1px solid #${l.color}55` : undefined,
                }}
              >
                {l.name}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 text-[11.5px] text-tertiary">
          <span>#{card.number}</span>
          {card.authorLogin && <span>by @{card.authorLogin}</span>}
          {card.comments > 0 && <span>{card.comments} comments</span>}
        </div>
      </div>
    </CardChrome>
  )
}

function PullCard({
  card,
  className,
}: {
  card: Extract<GithubCard, { kind: "github_pull" }>
  className?: string
}) {
  return (
    <CardChrome href={card.url} className={className}>
      <GithubChromeHeader
        repoLabel={`${card.owner}/${card.repo}`}
        ownerAvatarUrl={card.authorAvatarUrl}
      />
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <PullStateBadge state={card.state} draft={card.draft} />
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-primary">
            {card.title}
          </h3>
        </div>
        {card.excerpt && (
          <p className="line-clamp-2 text-[13px] text-tertiary">
            {card.excerpt}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-tertiary">
          <span>#{card.number}</span>
          {card.authorLogin && <span>by @{card.authorLogin}</span>}
          <span className="flex items-center gap-1 font-mono">
            <ArrowsRightLeftIcon className="size-3 shrink-0" />
            <span className="max-w-[110px] truncate">{card.headRef}</span>
            <span className="opacity-60">→</span>
            <span className="max-w-[110px] truncate">{card.baseRef}</span>
          </span>
          {(card.additions > 0 || card.deletions > 0) && (
            <span className="font-mono">
              <span className="text-success">+{compactNumber(card.additions)}</span>{" "}
              <span className="text-danger">−{compactNumber(card.deletions)}</span>
            </span>
          )}
          {card.changedFiles > 0 && <span>{card.changedFiles} files</span>}
        </div>
      </div>
    </CardChrome>
  )
}

function CommitCard({
  card,
  className,
}: {
  card: Extract<GithubCard, { kind: "github_commit" }>
  className?: string
}) {
  return (
    <CardChrome href={card.url} className={className}>
      <GithubChromeHeader
        repoLabel={`${card.owner}/${card.repo}`}
        ownerAvatarUrl={card.authorAvatarUrl}
      />
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-5 items-center rounded-md bg-base-2 px-1.5 font-mono text-[11px] text-tertiary">
            <CommandLineIcon className="mr-1 size-3 shrink-0" />
            {card.shortSha}
          </span>
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-primary">
            {card.messageHeadline}
          </h3>
        </div>
        {card.messageBody && (
          <pre className="line-clamp-2 font-mono text-[12px] whitespace-pre-wrap text-tertiary">
            {card.messageBody}
          </pre>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-tertiary">
          {(card.authorLogin || card.authorName) && (
            <span>
              by {card.authorLogin ? `@${card.authorLogin}` : card.authorName}
            </span>
          )}
          {(card.additions > 0 || card.deletions > 0) && (
            <span className="font-mono">
              <span className="text-success">+{compactNumber(card.additions)}</span>{" "}
              <span className="text-danger">−{compactNumber(card.deletions)}</span>
            </span>
          )}
          {card.changedFiles > 0 && <span>{card.changedFiles} files</span>}
        </div>
      </div>
    </CardChrome>
  )
}

type BadgeTone = "open" | "closed" | "merged" | "draft" | "neutral"

function Badge({
  tone,
  children,
}: {
  tone: BadgeTone
  children: React.ReactNode
}) {
  const map: Record<BadgeTone, string> = {
    open: "border border-success bg-success-subtle text-success",
    closed: "border border-danger bg-danger-subtle text-danger",
    merged: "border-violet-500/30 bg-violet-500/15 text-violet-700",
    draft: "border border-neutral bg-base-2 text-tertiary",
    neutral: "border border-neutral bg-base-2 text-tertiary",
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium tracking-wide uppercase",
        map[tone]
      )}
    >
      {children}
    </span>
  )
}

function IssueStateBadge({
  state,
  stateReason,
}: {
  state: "open" | "closed"
  stateReason: string | null
}) {
  if (state === "open") return <Badge tone="open">open</Badge>
  return (
    <Badge tone="closed">
      {stateReason === "not_planned" ? "not planned" : "closed"}
    </Badge>
  )
}

function PullStateBadge({
  state,
  draft,
}: {
  state: "open" | "closed" | "merged"
  draft: boolean
}) {
  if (state === "merged") {
    return (
      <Badge tone="merged">
        <ArrowPathRoundedSquareIcon className="size-3" />
        merged
      </Badge>
    )
  }
  if (state === "closed") return <Badge tone="closed">closed</Badge>
  if (draft) {
    return (
      <Badge tone="draft">
        <PencilSquareIcon className="size-3" />
        draft
      </Badge>
    )
  }
  return (
    <Badge tone="open">
      <ArrowsRightLeftIcon className="size-3" />
      open
    </Badge>
  )
}

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
