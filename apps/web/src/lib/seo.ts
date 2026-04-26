import { APP_NAME, WEB_URL } from "./env"

export type SeoMeta =
  | { name?: string; property?: string; content: string }
  | { title: string }

export interface SeoInput {
  /** Final page title; the helper appends " — {APP_NAME}" unless `rawTitle` is set. */
  title: string
  /** Skip the "{title} — {APP_NAME}" suffix. Use for the home/landing page. */
  rawTitle?: boolean
  description: string
  /** Absolute or root-relative path; used for og:url and the canonical link. */
  path: string
  /** Absolute or root-relative URL for the OG/Twitter image. Falls back to the
   *  dynamic /og endpoint, which renders the brand card from APP_NAME at request
   *  time so a rebrand never leaves a stale wordmark in the unfurl. */
  image?: string
  /** og:type — "article" for posts/articles/threads, otherwise "website" / "profile". */
  type?: "website" | "article" | "profile"
  /** Tells Twitter to render the large summary card (used when we have a real image). */
  largeCard?: boolean
  /** Optional extras for og:article (publish date, author handle). */
  publishedTime?: string
  authorHandle?: string
}

const abs = (urlOrPath: string) =>
  urlOrPath.startsWith("http") ? urlOrPath : `${WEB_URL}${urlOrPath}`

/** Builds the meta-tag array consumed by TanStack Router's `head()`. Centralising this
 *  keeps og: / twitter: / description in lockstep so unfurls don't drift from the page. */
export function buildSeoMeta(input: SeoInput): Array<SeoMeta> {
  const title = input.rawTitle ? input.title : `${input.title} — ${APP_NAME}`
  const url = abs(input.path)
  const image = abs(input.image ?? "/og")
  const type = input.type ?? "website"

  const meta: Array<SeoMeta> = [
    { title },
    { name: "description", content: input.description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: APP_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    {
      name: "twitter:card",
      content: input.largeCard ? "summary_large_image" : "summary",
    },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: input.description },
    { name: "twitter:image", content: image },
  ]

  if (input.publishedTime) {
    meta.push({
      property: "article:published_time",
      content: input.publishedTime,
    })
  }
  if (input.authorHandle) {
    meta.push({ property: "article:author", content: `@${input.authorHandle}` })
  }
  return meta
}

export function canonicalLink(path: string) {
  return { rel: "canonical", href: abs(path) }
}

/** Trims to a search-snippet-sized blurb without cutting words mid-token. */
export function clipDescription(text: string, max = 200): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (collapsed.length <= max) return collapsed
  const cut = collapsed.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
