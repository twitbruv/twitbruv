import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { useTheme } from "../lib/theme"
import forYouDark from "../assets/for-you-dark.png"
import forYouLight from "../assets/for-you-light.png"
import { useSettings } from "./settings/settings-provider"

const STORAGE_KEY = "for-you-announcement-dismissed"

function isDismissed(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(STORAGE_KEY) === "1"
}

function dismiss() {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1")
}

export function ForYouAnnouncement() {
  const [open, setOpen] = useState(() => !isDismissed())
  const { resolvedTheme } = useTheme()
  const { open: openSettings } = useSettings()

  if (!open) return null

  function handleDismiss() {
    dismiss()
    setOpen(false)
  }

  function handleTurnOff() {
    dismiss()
    setOpen(false)
    openSettings({ tab: "experiments" })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-lg">
        <img
          src={resolvedTheme === "dark" ? forYouDark : forYouLight}
          alt="Introducing the For You feed"
          className="w-full rounded-t-xl"
        />
        <div className="flex flex-col gap-4 p-4">
          <DialogHeader>
            <DialogTitle>Say goodbye to the Network tab</DialogTitle>
            <DialogDescription>
              We've added a personalized feed to your home timeline. You can
              turn it on or off anytime in Settings &rarr; Experiments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={handleTurnOff}>
              Turn off
            </Button>
            <Button variant="primary" size="sm" onClick={handleDismiss}>
              Dismiss
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
