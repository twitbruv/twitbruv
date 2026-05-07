import { Fragment } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { linkifyText } from "../rich-text"

interface ComposeTextHighlightProps {
  text: string
  className?: string
}

/**
 * Visual-only highlight layer that mirrors the compose textarea's content
 * with @mentions colored sky-500 — matching how RichText paints them in the
 * feed. Sits behind the textarea, which paints transparent text and a
 * themed caret on top.
 *
 * Must stay in lockstep with the textarea or the layers drift:
 *   - text-[15px] / leading-relaxed       (font size + line height)
 *   - pt-2                                (padding above first line)
 *   - whitespace-pre-wrap / break-words   (matches textarea wrapping)
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
            <span key={i} className="text-sky-500">
              {p.value}
            </span>
          )
        }
        return <Fragment key={i}>{p.value}</Fragment>
      })}
      {/* Textareas keep a visible empty line for a trailing \n; a flow div
          collapses it. Pad with a zero-width space so heights stay in sync. */}
      {text.endsWith("\n") && "​"}
    </div>
  )
}
