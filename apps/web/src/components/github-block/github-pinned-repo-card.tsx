import { StarIcon } from "@heroicons/react/24/solid"
import { ForkGlyph } from "./github-icons"
import type { GithubPinnedRepo } from "../../lib/api"

export function GithubPinnedRepoCard({ repo }: { repo: GithubPinnedRepo }) {
  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noreferrer"
      className="bg-subtle hover:bg-subtle/60 rounded-lg px-3.5 py-2.5 pb-3 transition-all duration-200 flex flex-col justify-between gap-0.5"
    >
      <div>
        <div className="flex items-center gap-1.5 text-[14.5px] font-semibold tracking-tight">
          <span className="truncate">{repo.name}</span>
        </div>
        {repo.description && (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[12px] font-light">
            {repo.description}
          </p>
        )}
      </div>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-[11.5px]">
        {repo.primaryLanguage && (
          <span className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{
                backgroundColor: repo.primaryLanguage.color ?? "currentColor",
              }}
            />
            {repo.primaryLanguage.name}
          </span>
        )}
        {repo.stars > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <StarIcon className="size-4 shrink-0 pb-0.5" aria-hidden />
            {repo.stars}
          </span>
        )}
        {repo.forks > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <ForkGlyph className="size-3.5 shrink-0" />
            {repo.forks}
          </span>
        )}
      </div>
    </a>
  )
}
