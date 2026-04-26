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
import { Compose } from "./compose"

export function ComposeFab() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="default"
            size="icon"
            className="fixed right-6 bottom-6 size-14 rounded-full shadow-lg shadow-primary/30"
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
