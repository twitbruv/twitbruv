import { useEffect, useRef } from "react"
import type { RefObject } from "react"

export function useInfiniteScrollSentinel(
  sentinelRef: RefObject<HTMLDivElement | null>,
  hasNext: boolean,
  loading: boolean,
  loadMore: () => void,
  options: { root?: Element | null; rootMargin?: string } = {}
) {
  const { root = null, rootMargin = "600px 0px" } = options
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  useEffect(() => {
    const node = sentinelRef.current
    // Tear the observer down while a load is in flight and re-create it when
    // loading flips back to false. Re-observing fires the initial intersection
    // callback again, which is what keeps loading more pages when the new
    // content is still short enough that the sentinel never left the viewport
    // — a plain observer wouldn't re-fire because the intersection state
    // didn't change between pages.
    if (!node || !hasNext || loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current()
      },
      { root, rootMargin }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNext, loading, sentinelRef, root, rootMargin])
}
