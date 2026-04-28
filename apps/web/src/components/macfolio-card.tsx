import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

const URL_PATTERN = /https?:\/\/\S+/g
const MACFOLIO_HOST = /(^|\.)macfolio\.com$/i

const MACFOLIO_OG_IMAGE = "https://macfolio.com/og-image.png"
const MACFOLIO_FAVICON = "https://macfolio.com/favicon.png"
const MACFOLIO_TITLE = "Macfolio — Curated Mac Discoveries"
const MACFOLIO_DESCRIPTION =
  "Discover the best software, hardware, workspace setups, books, videos, and posts for the Mac ecosystem."

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[),.;:!?]+$/, "")
}

export function isMacfolioUrl(raw: string): boolean {
  try {
    const u = new URL(trimTrailingPunctuation(raw))
    return MACFOLIO_HOST.test(u.host)
  } catch {
    return false
  }
}

export function extractMacfolioUrl(text: string): string | null {
  for (const match of text.matchAll(URL_PATTERN)) {
    const candidate = trimTrailingPunctuation(match[0])
    if (isMacfolioUrl(candidate)) return candidate
  }
  return null
}

function safeHostname(raw: string): string {
  try {
    return new URL(raw).host.replace(/^www\./, "")
  } catch {
    return "macfolio.com"
  }
}

export function MacfolioPill({
  url,
  className,
}: {
  url: string
  className?: string
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      data-post-card-ignore-open
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-md border border-neutral bg-base-2 px-1.5 py-0.5 align-middle font-semibold tracking-tight text-primary shadow-[var(--inset-shadow-primary)] no-underline transition hover:bg-subtle hover:scale-[1.03]",
        className
      )}
    >
      <img
        src={MACFOLIO_FAVICON}
        alt=""
        width={12}
        height={12}
        className="size-3 self-center rounded-[3px] object-cover"
        loading="lazy"
      />
      <span>macfolio</span>
    </a>
  )
}

export function MacfolioCard({
  url,
  className,
}: {
  url: string
  className?: string
}) {
  const host = safeHostname(url)
  const [heroOk, setHeroOk] = useState(true)
  const [faviconOk, setFaviconOk] = useState(true)

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      data-post-card-ignore-open
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group relative mt-3 block max-w-[520px] overflow-hidden rounded-lg border border-neutral bg-base-1 text-left shadow-sm transition-all duration-300 hover:shadow-banner",
        className
      )}
    >
      <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-neutral bg-base-2 px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57] shadow-[var(--inset-shadow-primary)]" />
          <span className="size-2.5 rounded-full bg-[#febc2e] shadow-[var(--inset-shadow-primary)]" />
          <span className="size-2.5 rounded-full bg-[#28c840] shadow-[var(--inset-shadow-primary)]" />
        </span>

        <span className="absolute right-1/2 translate-x-1/2 truncate text-xs text-tertiary">
          {host}
        </span>
      </div>

      <div className="relative aspect-1024/537 overflow-hidden bg-base-2">
        {heroOk ? (
          <img
            src={MACFOLIO_OG_IMAGE}
            alt=""
            width={1024}
            height={537}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={() => setHeroOk(false)}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.025]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-wider text-tertiary uppercase">
            macfolio.com
          </div>
        )}
        <span
          aria-hidden
          className="macfolio-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-transparent via-white/40 to-transparent"
        />
      </div>

      <div className="relative space-y-2 p-4">
        <h3 className="flex flex-row items-center gap-2 text-[15px] leading-snug font-semibold tracking-tight text-primary">
          <span className="block size-4 shrink-0 overflow-hidden rounded-md bg-subtle ring-1 ring-neutral">
            {faviconOk && (
              <img
                src={MACFOLIO_FAVICON}
                alt=""
                width={18}
                height={18}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                onError={() => setFaviconOk(false)}
              />
            )}
          </span>
          {MACFOLIO_TITLE}
        </h3>
        <p className="line-clamp-2 text-[13px] leading-relaxed text-tertiary">
          {MACFOLIO_DESCRIPTION}
        </p>

        <div className="group-hover:text-primary flex items-center gap-1.5 pt-1.5 text-[11.5px] font-medium text-tertiary transition">
          <span>Open {host}</span>
          <span
            aria-hidden
            className="transition duration-300 group-hover:translate-x-0.5"
          >
            →
          </span>
        </div>
      </div>
    </a>
  )
}

export function MacfolioCardFromText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const url = extractMacfolioUrl(text)
  if (!url) return null
  return <MacfolioCard url={url} className={className} />
}
