#!/usr/bin/env bun
// Extracts Heroicons (https://heroicons.com) from the @heroicons/react npm
// package into iOS Asset Catalog imagesets so the mobile app can use the same
// icons as the web app. Run with `bun apps/mobile/scripts/heroicons-extract.ts`.
import fs from "fs"
import path from "path"

const REPO_ROOT = path.resolve(__dirname, "../../..")
const OUTPUT_DIR = path.join(
  REPO_ROOT,
  "apps/mobile/twitbruv/Assets.xcassets/Heroicons"
)

interface Pair {
  name: string
  variant: "solid" | "outline"
}

const ICONS: Pair[] = [
  // Used in notifications, post engagement, etc.
  { name: "Heart", variant: "solid" },
  { name: "Heart", variant: "outline" },
  { name: "ChatBubbleLeft", variant: "solid" },
  { name: "ChatBubbleLeft", variant: "outline" },
  { name: "ChatBubbleBottomCenterText", variant: "solid" },
  { name: "ArrowPathRoundedSquare", variant: "solid" },
  { name: "ArrowPathRoundedSquare", variant: "outline" },
  { name: "AtSymbol", variant: "solid" },
  { name: "Bell", variant: "solid" },
  { name: "Bell", variant: "outline" },
  { name: "Bookmark", variant: "solid" },
  { name: "Bookmark", variant: "outline" },
  { name: "ChevronLeft", variant: "solid" },
  { name: "ChevronRight", variant: "solid" },
  { name: "EllipsisHorizontal", variant: "solid" },
  { name: "MapPin", variant: "solid" },
  { name: "GlobeAlt", variant: "solid" },
  { name: "Envelope", variant: "solid" },
  { name: "EnvelopeOpen", variant: "solid" },
  { name: "UserPlus", variant: "solid" },
  { name: "Identification", variant: "solid" },
  { name: "User", variant: "solid" },
  { name: "UserCircle", variant: "solid" },
  { name: "InformationCircle", variant: "solid" },
  { name: "ArrowUpCircle", variant: "solid" },
  { name: "XCircle", variant: "solid" },
  { name: "MinusCircle", variant: "solid" },
  { name: "MinusCircle", variant: "outline" },
  { name: "PencilSquare", variant: "solid" },
  { name: "Plus", variant: "solid" },
  { name: "Check", variant: "solid" },
  { name: "CheckBadge", variant: "solid" },
  { name: "Trash", variant: "solid" },
  { name: "QueueList", variant: "solid" },
  { name: "ShieldCheck", variant: "solid" },
  { name: "WrenchScrewdriver", variant: "solid" },
  { name: "WrenchScrewdriver", variant: "outline" },
  { name: "ExclamationTriangle", variant: "solid" },
  { name: "Clock", variant: "solid" },
  { name: "Photo", variant: "solid" },
  { name: "Home", variant: "solid" },
  { name: "MagnifyingGlass", variant: "solid" },
  { name: "Sparkles", variant: "solid" },
  { name: "XMark", variant: "solid" },
  { name: "Users", variant: "solid" },
  { name: "UserGroup", variant: "solid" },
  { name: "Calendar", variant: "solid" },
  { name: "RectangleStack", variant: "solid" },
  { name: "Lock", variant: "solid" },
  { name: "PaperAirplane", variant: "solid" },
  { name: "ArrowRight", variant: "solid" },
  { name: "ArrowLeft", variant: "solid" },
  { name: "Camera", variant: "solid" },
  { name: "Cog6Tooth", variant: "solid" },
  { name: "EllipsisVertical", variant: "solid" },
  { name: "Eye", variant: "solid" },
  { name: "EyeSlash", variant: "solid" },
  { name: "CheckCircle", variant: "solid" },
  { name: "Link", variant: "solid" },
  { name: "Flag", variant: "solid" },
  { name: "HandRaised", variant: "solid" },
  { name: "SpeakerXMark", variant: "solid" },
  { name: "FaceSmile", variant: "solid" },
  { name: "PaperAirplane", variant: "outline" },
]

function pascalToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

interface SvgAttrs {
  fill?: string
  stroke?: string
  strokeWidth?: string
}

function extractSvgAttrs(js: string): SvgAttrs {
  const m = js.match(
    /createElement\("svg",\s*Object\.assign\(\{([\s\S]*?)\},\s*props\)/
  )
  if (!m) return {}
  const block = m[1]
  const out: SvgAttrs = {}
  const fill = block.match(/fill:\s*"([^"]+)"/)
  if (fill) out.fill = fill[1]
  const stroke = block.match(/stroke:\s*"([^"]+)"/)
  if (stroke) out.stroke = stroke[1]
  const sw = block.match(/strokeWidth:\s*(\d+(?:\.\d+)?)/)
  if (sw) out.strokeWidth = sw[1]
  return out
}

interface PathAttrs {
  d: string
  fillRule?: string
  clipRule?: string
  strokeLinecap?: string
  strokeLinejoin?: string
}

function extractPaths(js: string): PathAttrs[] {
  const out: PathAttrs[] = []
  const re = /createElement\("path",\s*\{([\s\S]*?)\}\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(js)) !== null) {
    const block = m[1]
    const path: Partial<PathAttrs> = {}
    const d = block.match(/d:\s*"([^"]*)"/)
    if (!d) continue
    path.d = d[1]
    const fr = block.match(/fillRule:\s*"([^"]+)"/)
    if (fr) path.fillRule = fr[1]
    const cr = block.match(/clipRule:\s*"([^"]+)"/)
    if (cr) path.clipRule = cr[1]
    const sl = block.match(/strokeLinecap:\s*"([^"]+)"/)
    if (sl) path.strokeLinecap = sl[1]
    const sj = block.match(/strokeLinejoin:\s*"([^"]+)"/)
    if (sj) path.strokeLinejoin = sj[1]
    out.push(path as PathAttrs)
  }
  return out
}

function buildSvg(svgAttrs: SvgAttrs, paths: PathAttrs[]): string {
  // Xcode's asset catalog rasterizer does not resolve `currentColor`; baking
  // in a concrete black means the rendered PDF has actual filled/stroked
  // pixels that template rendering can tint via `.foregroundStyle(...)`.
  const concreteFill = svgAttrs.fill === "currentColor" ? "#000" : svgAttrs.fill
  const concreteStroke =
    svgAttrs.stroke === "currentColor" ? "#000" : svgAttrs.stroke

  const attrParts: string[] = [
    'xmlns="http://www.w3.org/2000/svg"',
    'viewBox="0 0 24 24"',
  ]
  if (concreteFill) attrParts.push(`fill="${concreteFill}"`)
  if (concreteStroke) attrParts.push(`stroke="${concreteStroke}"`)
  if (svgAttrs.strokeWidth)
    attrParts.push(`stroke-width="${svgAttrs.strokeWidth}"`)

  const pathsStr = paths
    .map((p) => {
      const parts: string[] = []
      if (p.fillRule) parts.push(`fill-rule="${p.fillRule}"`)
      if (p.clipRule) parts.push(`clip-rule="${p.clipRule}"`)
      if (p.strokeLinecap) parts.push(`stroke-linecap="${p.strokeLinecap}"`)
      if (p.strokeLinejoin) parts.push(`stroke-linejoin="${p.strokeLinejoin}"`)
      parts.push(`d="${p.d}"`)
      return `  <path ${parts.join(" ")} />`
    })
    .join("\n")

  return `<svg ${attrParts.join(" ")}>\n${pathsStr}\n</svg>\n`
}

function makeContentsJson(filename: string): string {
  return (
    JSON.stringify(
      {
        images: [{ filename, idiom: "universal" }],
        info: { author: "xcode", version: 1 },
        properties: {
          "preserves-vector-representation": true,
          "template-rendering-intent": "template",
        },
      },
      null,
      2
    ) + "\n"
  )
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true })
// Top-level Heroicons folder Contents.json. Intentionally NOT a namespace —
// callers reference assets by bare name (e.g. `Image("heart-solid")`).
fs.writeFileSync(
  path.join(OUTPUT_DIR, "Contents.json"),
  JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n"
)

let written = 0
let missing: string[] = []

for (const { name, variant } of ICONS) {
  const jsPath = path.join(
    REPO_ROOT,
    `node_modules/@heroicons/react/24/${variant}/${name}Icon.js`
  )
  if (!fs.existsSync(jsPath)) {
    missing.push(`${name} (${variant})`)
    continue
  }
  const js = fs.readFileSync(jsPath, "utf-8")
  const svgAttrs = extractSvgAttrs(js)
  const paths = extractPaths(js)
  if (paths.length === 0) {
    missing.push(`${name} (${variant}) — no paths extracted`)
    continue
  }

  const svg = buildSvg(svgAttrs, paths)
  const kebab = pascalToKebab(name)
  const assetName = `${kebab}-${variant}`
  const dir = path.join(OUTPUT_DIR, `${assetName}.imageset`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${assetName}.svg`), svg)
  fs.writeFileSync(
    path.join(dir, "Contents.json"),
    makeContentsJson(`${assetName}.svg`)
  )
  written++
}

console.log(`Wrote ${written} icons to ${OUTPUT_DIR}`)
if (missing.length > 0) {
  console.log("Missing or empty:", missing.join(", "))
}
