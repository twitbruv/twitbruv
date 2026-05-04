import { GithubContributionsHeatmap } from "./github-contributions-heatmap"
import { GitHubMark } from "./github-icons"
import { GithubPinnedRepoCard } from "./github-pinned-repo-card"
import type { GithubProfilePayload } from "../../lib/api"

type ConnectedGithubProfile = Extract<GithubProfilePayload, { connected: true }>

export function GithubProfileSection({
  profile,
}: {
  profile: ConnectedGithubProfile
}) {
  return (
    <section className="w-full min-w-0 px-4 pt-2 pb-5">
      <div className="w-full min-w-0 space-y-1 rounded-2xl bg-subtle p-1">
        <div className="flex flex-wrap items-center gap-2 px-2 pt-1.5">
          <h2 className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold">
            <GitHubMark />
            <span className="text-sm">GitHub</span>
          </h2>
          <span className="h-2.5 w-px rounded-full bg-inverse" />
          <a
            href={profile.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground pb-0.5 text-sm font-normal text-secondary hover:underline"
          >
            @{profile.login}
          </a>
        </div>

        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-lg bg-base-1 px-2 pt-0.5 pb-2">
          <GithubContributionsHeatmap
            data={profile.contributions}
            stale={profile.stale}
            className="mt-3 w-full max-w-full min-w-0"
          />
        </div>
      </div>

      {profile.pinned.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {profile.pinned.map((repo) => (
            <GithubPinnedRepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </section>
  )
}
