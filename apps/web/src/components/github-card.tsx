import {
  GithubCommitCard,
  GithubIssueCard,
  GithubPullCard,
  GithubRepoCard,
} from "@workspace/ui/components/github-card"
import type { GithubCard } from "@workspace/github-unfurl/card"

export function GithubCardBlock({
  card,
  className,
}: {
  card: GithubCard
  className?: string
}) {
  switch (card.kind) {
    case "github_repo":
      return <GithubRepoCard {...card} className={className} />
    case "github_issue":
      return <GithubIssueCard {...card} className={className} />
    case "github_pull":
      return <GithubPullCard {...card} className={className} />
    case "github_commit":
      return <GithubCommitCard {...card} className={className} />
  }
}
