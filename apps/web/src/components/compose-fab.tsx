import { useState } from "react"
import { NotePencilIcon } from "@phosphor-icons/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { Compose } from "./compose"

export function ComposeFab({
  stackAboveMobileTabBar = false,
}: {
  stackAboveMobileTabBar?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="default"
            size="icon"
            className={cn(
              "fixed right-6 size-14 rounded-full shadow-lg shadow-primary/30",
              stackAboveMobileTabBar
                ? "bottom-[calc(1.5rem+3.5rem+env(safe-area-inset-bottom,0px))]"
                : "bottom-6"
            )}
          >
            <NotePencilIcon className="size-6" />
          </Button>
        }
      />
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-semibold">New post</DialogTitle>
          <DialogDescription className="sr-only">
            Write a new post. Drag images into the box to attach them.
          </DialogDescription>
        </DialogHeader>
        <Compose onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
