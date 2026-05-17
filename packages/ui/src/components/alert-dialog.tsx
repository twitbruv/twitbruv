import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"

export interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  cancelLabel?: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  onConfirm,
}: AlertDialogProps) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      /* caller handles errors */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
