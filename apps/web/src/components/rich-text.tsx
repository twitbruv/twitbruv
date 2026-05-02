import { Link } from "@tanstack/react-router"
import { LinkPill } from "./link-card"
import type { ReactNode } from "react"

type Part =
  | { type: "text"; value: string }
  | { type: "hashtag"; value: string }
  | { type: "mention"; value: string }
  | { type: "url"; value: string }

const PATTERN = /(#[a-z0-9_]+|@[a-z0-9_]+|https?:\/\/\S+)/gi

export function linkifyText(text: string): Array<Part> {
  const parts: Array<Part> = []
  let last = 0
  for (const match of text.matchAll(PATTERN)) {
    const idx = match.index
    if (idx > last) parts.push({ type: "text", value: text.slice(last, idx) })
    const value = match[0]
    if (value.startsWith("#")) parts.push({ type: "hashtag", value })
    else if (value.startsWith("@")) parts.push({ type: "mention", value })
    else parts.push({ type: "url", value })
    last = idx + value.length
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) })
  return parts
}

export function RichText({ text }: { text: string }): ReactNode {
  const parts = linkifyText(text)
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>
        if (p.type === "hashtag") {
          return (
            <Link
              key={i}
              to="/hashtag/$tag"
              params={{ tag: p.value.slice(1) }}
              className="text-primary hover:underline"
            >
              {p.value}
            </Link>
          )
        }
        if (p.type === "mention") {
          return (
            <Link
              key={i}
              to="/$handle"
              params={{ handle: p.value.slice(1) }}
              className="text-sky-500 hover:underline"
            >
              {p.value}
            </Link>
          )
        }
        return <LinkPill key={i} url={p.value} />
      })}
    </>
  )
}
