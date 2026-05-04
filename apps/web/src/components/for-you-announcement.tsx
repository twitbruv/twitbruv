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
        <div className="flex flex-col gap-5 p-5 sm:p-4">
          <DialogHeader>
            <DialogTitle className="text-xl/tight font-semibold sm:text-lg/tight">
              Say goodbye to the Network tab
            </DialogTitle>
            <DialogDescription className="text-base/relaxed sm:text-sm/relaxed">
              We've added a personalized feed to your home timeline. You can
              turn it on or off anytime in Settings &rarr; Experiments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button
              variant="secondary"
              className="flex-[3] sm:flex-none"
              onClick={handleTurnOff}
            >
              Turn off
            </Button>
            <Button
              variant="primary"
              className="flex-[7] sm:flex-none"
              onClick={handleDismiss}
            >
              Dismiss
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
