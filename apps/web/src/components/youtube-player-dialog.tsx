import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { Dialog, DialogContent } from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { LightboxSidebar } from "./lightbox-sidebar"
import type { ReactNode } from "react"
import type { Post } from "../lib/api"

type PlayerOpenState =
  | { open: false }
  | {
      open: true
      videoId: string
      playlistId: string | null
      startSec: number | null
      isShort: boolean
      embeddable: boolean
      watchUrl: string
      contextPost: Post
    }

type YouTubePlayerContextValue = {
  openYoutube: (
    opts: Omit<Extract<PlayerOpenState, { open: true }>, "open">
  ) => void
  close: () => void
}

const YouTubePlayerContext = createContext<YouTubePlayerContextValue | null>(
  null
)

export function useYouTubePlayer() {
  const v = useContext(YouTubePlayerContext)
  if (!v) throw new Error("useYouTubePlayer requires YouTubePlayerProvider")
  return v
}

export function YouTubePlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerOpenState>({ open: false })

  const openYoutube = useCallback(
    (opts: Omit<Extract<PlayerOpenState, { open: true }>, "open">) => {
      setState({ open: true, ...opts })
    },
    []
  )

  const close = useCallback(() => setState({ open: false }), [])

  const value = useMemo(() => ({ openYoutube, close }), [openYoutube, close])

  return (
    <YouTubePlayerContext.Provider value={value}>
      {children}
      <YouTubePlayerDialog state={state} onClose={close} />
    </YouTubePlayerContext.Provider>
  )
}

function embedSrc(state: Extract<PlayerOpenState, { open: true }>): string {
  const p = new URLSearchParams()
  p.set("autoplay", "1")
  p.set("rel", "0")
  p.set("modestbranding", "1")
  if (typeof window !== "undefined" && window.location.origin) {
    p.set("origin", window.location.origin)
  }
  if (state.startSec != null && state.startSec > 0) {
    p.set("start", String(Math.floor(state.startSec)))
  }
  if (state.playlistId) {
    p.set("list", state.playlistId)
  }
  return `https://www.youtube.com/embed/${state.videoId}?${p.toString()}`
}

function YouTubePlayerDialog({
  state,
  onClose,
}: {
  state: PlayerOpenState
  onClose: () => void
}) {
  const open = state.open
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(92vh,900px)] w-[min(96vw,980px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        {open && (
          <>
            <div className="flex items-center justify-between border-b border-neutral px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-primary">
                  YouTube
                </span>
                <a
                  href={state.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-post-card-ignore-open
                  className="text-xs text-tertiary underline-offset-2 hover:text-primary hover:underline"
                >
                  Open on YouTube
                </a>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-2 text-tertiary hover:bg-base-2 hover:text-primary"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row">
              <div
                className={cn(
                  "relative w-full shrink-0 bg-black md:w-[min(100%,720px)]",
                  state.isShort
                    ? "aspect-[9/16] max-h-[72vh] md:max-h-none"
                    : "aspect-video"
                )}
              >
                {state.embeddable ? (
                  <iframe
                    title="YouTube player"
                    src={embedSrc(state)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="absolute inset-0 size-full border-0"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-white">
                    <p>Playback is disabled for this embed.</p>
                    <a
                      href={state.watchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
                      data-post-card-ignore-open
                    >
                      Open on YouTube
                    </a>
                  </div>
                )}
              </div>
              <div className="max-h-[40vh] min-h-0 flex-1 overflow-y-auto border-t border-neutral md:max-h-none md:border-t-0 md:border-l md:border-neutral">
                <LightboxSidebar post={state.contextPost} />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
