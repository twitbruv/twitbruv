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
  const loadingRef = useRef(loading)
  loadingRef.current = loading

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNext) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingRef.current) {
          loadMoreRef.current()
        }
      },
      { root, rootMargin }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNext, sentinelRef, root, rootMargin])
}
