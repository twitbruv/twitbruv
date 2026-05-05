import { XMarkIcon } from "@heroicons/react/16/solid"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import type { PendingAttachment } from "./types"

interface ComposeAttachmentsProps {
  attachments: Array<PendingAttachment>
  editingAttachmentId: string | null
  onSetEditingAttachmentId: (id: string | null) => void
  onUpdateAltText: (tempId: string, altText: string) => void
  onRemoveAttachment: (tempId: string) => void
}

export function ComposeAttachments({
  attachments,
  editingAttachmentId,
  onSetEditingAttachmentId,
  onUpdateAltText,
  onRemoveAttachment,
}: ComposeAttachmentsProps) {
  if (attachments.length === 0) return null

  const editingAttachment = editingAttachmentId
    ? attachments.find((a) => a.tempId === editingAttachmentId)
    : null

  return (
    <div className="mt-2 space-y-2">
      <div
        className={cn(
          "grid gap-0.5 overflow-hidden rounded-lg",
          attachments.length === 1 && "grid-cols-1",
          attachments.length === 2 && "grid-cols-2",
          attachments.length >= 3 && "grid-cols-2 grid-rows-2"
        )}
      >
        {attachments.map((a, i) => (
          <div
            key={a.tempId}
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-out-expo",
              a.removing ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={cn(
                  "relative transition-all duration-200 ease-out-expo",
                  a.removing ? "scale-95 opacity-0" : "scale-100 opacity-100"
                )}
              >
                <div
                  className={cn(
                    "relative overflow-hidden bg-base-2",
                    attachments.length === 1 && "aspect-[16/9]",
                    attachments.length === 2 && "aspect-[4/3]",
                    attachments.length >= 3 && i === 0 && "row-span-2 h-full",
                    attachments.length >= 3 && i > 0 && "aspect-square"
                  )}
                >
                  <img
                    src={a.previewUrl}
                    alt=""
                    className="h-full w-full object-cover object-center"
                  />
                  {a.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-base-1/50">
                      <Spinner className="text-primary" />
                    </div>
                  )}
                  {a.status === "failed" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-danger-subtle/50 p-2 text-center text-xs text-danger">
                      {a.error ?? "failed"}
                    </div>
                  )}
                  {/* Edit button */}
                  <Button
                    type="button"
                    variant="glass"
                    size="sm"
                    onClick={() =>
                      onSetEditingAttachmentId(
                        editingAttachmentId === a.tempId ? null : a.tempId
                      )
                    }
                    className="absolute top-1.5 left-1.5"
                  >
                    Edit
                  </Button>
                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="glass"
                    size="sm"
                    onClick={() => onRemoveAttachment(a.tempId)}
                    disabled={a.removing}
                    aria-label="Remove image"
                    iconLeft={<XMarkIcon className="size-4" />}
                    className="absolute top-1.5 right-1.5"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alt text panel for editing */}
      {editingAttachment && (
        <div className="rounded-lg border border-neutral p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-tertiary">Alt text</span>
            <Button
              type="button"
              variant="transparent"
              size="sm"
              onClick={() => onSetEditingAttachmentId(null)}
              aria-label="Close"
              iconLeft={<XMarkIcon className="size-4" />}
            />
          </div>
          <textarea
            value={editingAttachment.altText}
            onChange={(e) =>
              onUpdateAltText(editingAttachment.tempId, e.target.value)
            }
            placeholder="Describe this image for people who are blind or have low vision"
            maxLength={1000}
            rows={2}
            className="mt-2 w-full resize-none rounded-lg border border-neutral bg-base-2 px-3 py-2 text-sm text-primary outline-none placeholder:text-tertiary focus:border-neutral-strong"
          />
        </div>
      )}
    </div>
  )
}
