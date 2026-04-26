import { useEffect, useState } from "react"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

const MOBILE_BREAKPOINT = 768
const OVERLAP_PX = 80

export function useMobileKeyboardOpen() {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isMobile) {
      setOpen(false)
      return
    }
    const vv = window.visualViewport
    if (!vv) return
    function tick() {
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        setOpen(false)
        return
      }
      const port = window.visualViewport
      if (!port) return
      setOpen(window.innerHeight - port.height > OVERLAP_PX)
    }
    vv.addEventListener("resize", tick)
    vv.addEventListener("scroll", tick)
    tick()
    return () => {
      vv.removeEventListener("resize", tick)
      vv.removeEventListener("scroll", tick)
    }
  }, [isMobile])

  return open
}
