import { APP_NAME } from "./env"

/** Standard OG card aspect — what Twitter, Facebook, Slack, Discord etc. expect. */
export const OG_SIZE = { width: 1200, height: 630 } as const

type FontWeight = 400 | 500 | 600 | 800

interface FontEntry {
  name: "Inter"
  data: ArrayBuffer
  weight: FontWeight
  style: "normal"
}

let fontsPromise: Promise<Array<FontEntry>> | null = null

/** Google Fonts hands back TTF/OTF when called with an old-IE user-agent and woff2
 *  for modern browsers. Satori (under @vercel/og) cannot decode woff2, so we force
 *  the legacy path. The first request pays ~150ms; the result is cached per process. */
async function fetchInterWeight(weight: FontWeight): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`
  const css = await (
    await fetch(cssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko",
      },
    })
  ).text()
  const match = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\('(?:truetype|opentype)'\)/)
  if (!match) throw new Error(`Inter ${weight}: could not parse font url from Google Fonts CSS`)
  return await (await fetch(match[1])).arrayBuffer()
}

export async function getOgFonts(): Promise<Array<FontEntry>> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      fetchInterWeight(400),
      fetchInterWeight(500),
      fetchInterWeight(600),
      fetchInterWeight(800),
    ]).then(([w400, w500, w600, w800]) => [
      { name: "Inter", data: w400, weight: 400, style: "normal" },
      { name: "Inter", data: w500, weight: 500, style: "normal" },
      { name: "Inter", data: w600, weight: 600, style: "normal" },
      { name: "Inter", data: w800, weight: 800, style: "normal" },
    ])
    fontsPromise.catch(() => {
      // If the fetch fails (offline build, blocked egress) clear the cache so the
      // next render retries instead of failing forever with the same rejection.
      fontsPromise = null
    })
  }
  return fontsPromise
}

export const OG_HEADERS = {
  // ImageResponse already sets Content-Type=image/png; we only override caching.
  "Cache-Control":
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
}

export function compactNumber(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Picks a deterministic gradient pair from a string so two different posts/profiles
 *  don't share the same backdrop. Hue range stays in our blue→violet band. */
function gradientFromSeed(seed: string): [string, string] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const hueA = 210 + (Math.abs(hash) % 70) // 210..280
  const hueB = (hueA + 40) % 360
  return [`hsl(${hueA} 75% 18%)`, `hsl(${hueB} 75% 8%)`]
}

interface OgFrameProps {
  /** Tiny label rendered top-left ("POST", "ARTICLE", "PROFILE", etc). */
  eyebrow: string
  /** Influences the background gradient so cards aren't all identical. */
  seed: string
  children: React.ReactNode
}

/** Shared 1200×630 frame: gradient background, branded eyebrow, twotter wordmark. */
export function OgFrame({ eyebrow, seed, children }: OgFrameProps) {
  const [from, to] = gradientFromSeed(seed)
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 72,
        position: "relative",
        backgroundColor: "#0a0a0a",
        backgroundImage: `radial-gradient(circle at 20% 0%, ${from} 0%, transparent 55%), radial-gradient(circle at 100% 100%, ${to} 0%, transparent 60%), linear-gradient(180deg, #0a0a0a 0%, #050505 100%)`,
        color: "white",
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: 4,
          color: "rgba(255,255,255,0.6)",
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: "#60a5fa",
            boxShadow: "0 0 24px #60a5fa",
          }}
        />
        {eyebrow}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          marginTop: 36,
        }}
      >
        {children}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: -0.5,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
              fontSize: 22,
              fontWeight: 800,
              color: "#0a0a0a",
            }}
          >
            t
          </div>
          {APP_NAME}
        </div>
      </div>
    </div>
  )
}

interface AvatarProps {
  src?: string | null
  initial: string
  size: number
}

/** Square-rounded avatar so Satori can render either a remote image or a fallback
 *  initial chip with the same footprint. Remote images need `width`/`height` set
 *  explicitly because Satori can't measure them like a browser would. */
export function OgAvatar({ src, initial, size }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          border: "2px solid rgba(255,255,255,0.15)",
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
        color: "#0a0a0a",
        fontSize: size * 0.42,
        fontWeight: 800,
      }}
    >
      {initial.toUpperCase()}
    </div>
  )
}

interface StatsRowProps {
  items: Array<{ label: string; value: number }>
}

export function OgStats({ items }: StatsRowProps) {
  const visible = items.filter((i) => i.value > 0)
  if (visible.length === 0) return null
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        fontSize: 24,
        color: "rgba(255,255,255,0.7)",
      }}
    >
      {visible.map((item, i) => (
        <div
          key={item.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {i > 0 && (
            <span
              style={{
                color: "rgba(255,255,255,0.25)",
                marginRight: 18,
              }}
            >
              ·
            </span>
          )}
          <span style={{ fontWeight: 700, color: "white" }}>
            {compactNumber(item.value)}
          </span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Trims to roughly N visible characters without slicing through a word. */
export function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (collapsed.length <= max) return collapsed
  const cut = collapsed.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
