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
        "inline-flex items-baseline gap-1.5 rounded-md border border-border bg-linear-to-b from-zinc-50 to-zinc-100 px-1.5 py-0.5 align-middle font-semibold tracking-tight text-foreground no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:scale-[1.03] hover:shadow-sm dark:from-zinc-800 dark:to-zinc-900 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        className
      )}
    >
      {/* <span className="inline-flex items-center gap-[3px] self-center">
        <span className="size-1.5 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.18)]" />
        <span className="size-1.5 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.18)]" />
        <span className="size-1.5 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.18)]" />
      </span>*/}
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
        "group relative mt-3 block max-w-[520px] overflow-hidden rounded-xl border border-border bg-linear-to-br from-zinc-50 via-white to-zinc-100 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-px hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_16px_32px_-12px_rgba(0,0,0,0.18)] dark:from-zinc-900 dark:via-zinc-950 dark:to-black",
        className
      )}
    >
      <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border/70 bg-linear-to-b from-zinc-200/60 to-zinc-100/40 px-3 py-2 dark:from-zinc-800/70 dark:to-zinc-900/40">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)]" />
          <span className="size-2.5 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)]" />
          <span className="size-2.5 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)]" />
        </span>

        <span className="absolute right-1/2 translate-x-1/2 truncate text-xs">
          {host}
        </span>
      </div>

      <div className="relative aspect-1024/537 overflow-hidden bg-linear-to-br from-zinc-200 to-zinc-100 dark:from-zinc-800 dark:to-zinc-900">
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
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            macfolio.com
          </div>
        )}
        <span
          aria-hidden
          className="macfolio-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-transparent via-white/40 to-transparent dark:via-white/15"
        />
      </div>

      <div className="relative space-y-2 p-4">
        <div className="flex items-center justify-between gap-2"></div>

        <h3 className="flex flex-row items-center gap-2 text-[15px] leading-snug font-semibold tracking-tight text-foreground">
          <span className="block size-4 shrink-0 overflow-hidden rounded-[5px] bg-muted ring-1 ring-black/5 dark:ring-white/10">
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
        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {MACFOLIO_DESCRIPTION}
        </p>

        {/* <div className="flex flex-wrap gap-1 pt-0.5">
          {MACFOLIO_CATEGORIES.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-background/70 px-2 py-[1px] text-[10.5px] font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div> */}

        <div className="flex items-center gap-1.5 pt-1.5 text-[11.5px] font-medium text-muted-foreground transition group-hover:text-foreground">
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
