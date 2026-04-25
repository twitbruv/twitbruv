// Server-only helpers for the dynamic OG image endpoints.
// Output is plain SVG; social crawlers honour `Content-Type: image/svg+xml`,
// and SVG keeps us free of native image deps (no satori / canvas / sharp).

import { APP_NAME } from "./env"

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

/** Approximate character-per-line for the chosen font size. We don't have access
 *  to real font metrics in plain SVG, so we use a conservative average glyph width
 *  to wrap before text overflows the 1080px content column at 1200x630. */
function wrap(text: string, charsPerLine: number, maxLines: number): Array<string> {
  const words = text.replace(/\s+/g, " ").trim().split(" ")
  const lines: Array<string> = []
  let current = ""
  for (const word of words) {
    const tentative = current ? `${current} ${word}` : word
    if (tentative.length > charsPerLine) {
      if (current) lines.push(current)
      current = word
      if (lines.length === maxLines - 1 && current.length > charsPerLine) {
        lines.push(`${current.slice(0, charsPerLine - 1)}…`)
        return lines
      }
    } else {
      current = tentative
    }
    if (lines.length >= maxLines) return lines.slice(0, maxLines)
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]
    const remaining = words.slice(lines.join(" ").split(" ").length).length
    if (remaining > 0) lines[maxLines - 1] = `${last.slice(0, charsPerLine - 1)}…`
  }
  return lines
}

interface RenderOpts {
  /** Small label across the top, e.g. "@handle · post" or "Article". */
  eyebrow?: string
  /** The main display string — post text, article title, or profile name. */
  title: string
  /** Optional secondary line — author, subtitle, or bio. */
  subtitle?: string
  /** Optional footer accent shown bottom-left, e.g. "5.2k likes · 1.1k reposts". */
  footer?: string
}

/** Renders a 1200×630 OG card. Same gradient as /public/og.svg so static and
 *  dynamic cards feel like the same brand surface. */
export function renderOgSvg(opts: RenderOpts): string {
  const titleLines = wrap(opts.title, 36, 4)
  const subtitleLines = opts.subtitle ? wrap(opts.subtitle, 50, 2) : []
  const titleStartY = subtitleLines.length > 0 ? 240 : 280

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="80" dy="${i === 0 ? 0 : 78}">${xmlEscape(line)}</tspan>`
    )
    .join("")

  const subtitleTspans = subtitleLines
    .map(
      (line, i) =>
        `<tspan x="80" dy="${i === 0 ? 0 : 44}">${xmlEscape(line)}</tspan>`
    )
    .join("")

  const subtitleY = titleStartY + titleLines.length * 78 + 40

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(220 90% 56%)"/>
      <stop offset="100%" stop-color="hsl(260 80% 50%)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="80" y="120" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="28" fill="rgba(255,255,255,0.78)" letter-spacing="2">${xmlEscape((opts.eyebrow ?? APP_NAME).toUpperCase())}</text>
  <text y="${titleStartY}" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="64" fill="white">${titleTspans}</text>
  ${subtitleLines.length > 0 ? `<text y="${subtitleY}" font-family="Inter, system-ui, sans-serif" font-weight="400" font-size="34" fill="rgba(255,255,255,0.85)">${subtitleTspans}</text>` : ""}
  <text x="80" y="560" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="36" fill="white">${xmlEscape(APP_NAME)}</text>
  ${opts.footer ? `<text x="1120" y="560" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="26" fill="rgba(255,255,255,0.78)">${xmlEscape(opts.footer)}</text>` : ""}
</svg>`
}

/** Cache for one hour at the edge, longer in browser. Lets crawlers re-fetch
 *  often enough to pick up edits without hammering our API on every unfurl. */
export const OG_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
}
