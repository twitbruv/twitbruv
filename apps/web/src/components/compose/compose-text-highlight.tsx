import { Fragment } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Mention, linkifyText } from "../rich-text"

interface ComposeTextHighlightProps {
  text: string
  className?: string
}

/**
 * Visual mirror of the compose textarea, painted on top of it so mention
 * spans can host the shared hover-card. The wrapper is pointer-events-none
 * so typing/clicks fall through to the textarea below; only mention spans
 * flip back to auto.
 *
 * Font/leading/padding/wrapping must match the textarea or the layers
 * drift: text-[15px] leading-relaxed pt-2 whitespace-pre-wrap break-words.
 */
export function ComposeTextHighlight({
  text,
  className,
}: ComposeTextHighlightProps) {
  const parts = linkifyText(text)
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 pt-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-primary select-none",
        className
      )}
    >
      {parts.map((p, i) => {
        if (p.type === "mention") {
          return (
            <span key={i} className="pointer-events-auto">
              <Mention handle={p.value.slice(1)} />
            </span>
          )
        }
        return <Fragment key={i}>{p.value}</Fragment>
      })}
      {text.endsWith("\n") && "​"}
    </div>
  )
}
