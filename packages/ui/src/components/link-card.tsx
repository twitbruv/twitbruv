import { LinkIcon } from "@heroicons/react/16/solid"
import { useEffect, useState } from "react"
import { cn } from "../lib/utils"

export const linkCardShellClasses =
  "group mt-3 block max-w-[560px] overflow-hidden rounded-lg border border-neutral bg-base-1 transition-all hover:shadow-sm"

export function LinkCardShell({
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
      className={cn(linkCardShellClasses, className)}
    >
      {children}
    </a>
  )
}

export function trimTrailingPunct(url: string): string {
  return url.replace(/[),.;:!?]+$/, "")
}

function faviconServiceUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`
}

function safeHost(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./i, "")
  } catch {
    return ""
  }
}

/** Host + path, no protocol, query, or hash — for compact inline link pills. */
export function linkPillDisplayLabel(trimmedUrl: string): string {
  try {
    const u = new URL(trimmedUrl)
    const host = u.hostname.replace(/^www\./i, "")
    const path = u.pathname
    if (!path || path === "/") return host
    return `${host}${path}`
  } catch {
    const stripped = trimmedUrl.replace(/^https?:\/\//i, "")
    const cut = stripped.split(/[?#]/)[0] ?? stripped
    return cut.length > 0 ? cut : trimmedUrl
  }
}

export function LinkPill({
  url,
  className,
}: {
  url: string
  className?: string
}) {
  const trimmed = trimTrailingPunct(url)
  const hostForFavicon = safeHost(trimmed)
  const fav = hostForFavicon ? faviconServiceUrl(hostForFavicon) : null
  const label = linkPillDisplayLabel(trimmed)
  const [faviconFailed, setFaviconFailed] = useState(false)

  useEffect(() => {
    setFaviconFailed(false)
  }, [trimmed])

  const showFaviconImg = Boolean(fav && !faviconFailed)

  return (
    <a
      href={trimmed}
      target="_blank"
      rel="noreferrer"
      title={trimmed}
      data-post-card-ignore-open
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex max-w-[min(100%,18rem)] items-center gap-1.5 rounded-md border border-neutral bg-base-2 px-1.5 py-0.5 align-middle text-sm font-semibold tracking-tight text-primary no-underline shadow-[var(--inset-shadow-primary)] transition hover:scale-[1.03] hover:bg-subtle",
        className
      )}
    >
      {showFaviconImg && fav ? (
        <img
          src={fav}
          alt=""
          width={12}
          height={12}
          className="size-3 shrink-0 rounded-[3px] object-cover"
          loading="lazy"
          onError={() => setFaviconFailed(true)}
        />
      ) : (
        <LinkIcon aria-hidden className="size-3 shrink-0 text-tertiary" />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </a>
  )
}

export interface LinkCardProps {
  url: string
  title: string
  description?: string | null
  imageUrl?: string | null
  siteName?: string | null
  className?: string
}

export function LinkCard({
  url,
  title,
  description,
  imageUrl,
  siteName,
  className,
}: LinkCardProps) {
  const host = safeHost(url)
  const siteLabel = siteName ?? host
  const [heroOk, setHeroOk] = useState(Boolean(imageUrl))
  const hasHero = Boolean(imageUrl) && heroOk

  return (
    <LinkCardShell href={url} className={cn("p-1", className)}>
      {hasHero ? (
        <div className="relative aspect-[1200/630] overflow-hidden rounded-md bg-base-2">
          <img
            src={imageUrl!}
            alt=""
            width={1200}
            height={630}
            loading="lazy"
            decoding="async"
            onError={() => setHeroOk(false)}
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}

      <div className={cn("flex flex-col", hasHero ? "p-3 pt-3" : "p-3")}>
        <div className="truncate text-sm text-tertiary">{siteLabel}</div>
        <h3 className="text-sm leading-normal font-semibold tracking-tight text-primary">
          {title}
        </h3>
        {description ? (
          <p className="line-clamp-2 text-sm leading-normal text-tertiary">
            {description}
          </p>
        ) : null}
      </div>
    </LinkCardShell>
  )
}
