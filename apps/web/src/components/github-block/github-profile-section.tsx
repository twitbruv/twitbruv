import { GithubContributionsHeatmap } from "./github-contributions-heatmap"
import { GitHubMark } from "./github-icons"
import { GithubPinnedRepoCard } from "./github-pinned-repo-card"
import type { GithubProfilePayload } from "../../lib/api"

type ConnectedGithubProfile = Extract<GithubProfilePayload, { connected: true }>

export function GithubProfileSection({ profile }: { profile: ConnectedGithubProfile }) {
  return (
    <section className="px-4 pb-5 pt-2">
      <div className="bg-subtle p-1 rounded-2xl space-y-1">
        <div className="flex flex-wrap items-center px-2 pt-1.5 gap-2">
          <h2 className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold">
            <GitHubMark />
            <span className="text-sm">GitHub</span>
          </h2>
          <span className="w-px h-2.5 rounded-full bg-inverse" />
          <a
            href={profile.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-secondary hover:text-foreground font-normal hover:underline text-sm pb-0.5"
          >
            @{profile.login}
          </a>
        </div>

        <div className="bg-base-1 px-2 pb-2 pt-0.5 rounded-lg">
          <GithubContributionsHeatmap
            data={profile.contributions}
            stale={profile.stale}
            className="mt-3"
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
