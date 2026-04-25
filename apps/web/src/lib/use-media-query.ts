import { useEffect, useState } from "react"

export const HOME_PANEL_MIN_INSET_WIDTH = 1120

/** Matches the side panel slide transition length on home (`duration-300`). */
export const HOME_PANEL_PRESENCE_MS = 300

const INSET_SELECTOR = '[data-slot="sidebar-inset"]'

function getInsetWidth() {
  if (typeof document === "undefined") return 0
  const inset = document.querySelector<HTMLElement>(INSET_SELECTOR)
  if (!inset) return 0
  return inset.getBoundingClientRect().width
}

export function useInsetMinWidth(min: number) {
  const [matches, setMatches] = useState(() => getInsetWidth() >= min)

  useEffect(() => {
    if (typeof document === "undefined") return
    const inset = document.querySelector<HTMLElement>(INSET_SELECTOR)
    if (!inset) return

    const update = () => setMatches(inset.getBoundingClientRect().width >= min)

    update()
    const observer = new ResizeObserver(update)
    observer.observe(inset)
    return () => observer.disconnect()
  }, [min])

  return matches
}

export function isPanelLayoutAvailable() {
  return getInsetWidth() >= HOME_PANEL_MIN_INSET_WIDTH
}
