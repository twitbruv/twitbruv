import { useState } from "react"
import {
  EllipsisHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  MapPinIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/solid"
import { AlertDialog } from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import { api } from "../lib/api"
import { authClient } from "../lib/auth"
import { ReportDialog } from "./report-dialog"
import type { Post } from "../lib/api"

const EDIT_WINDOW_MS = 5 * 60 * 1000

export function PostMenu({
  post,
  onChange,
  onRemove,
  canHide = false,
  isRepost = false,
  onStartEdit,
  className,
}: {
  post: Post
  onChange?: (next: Post) => void
  onRemove?: () => void
  canHide?: boolean
  /** When true, the post is rendered inside a repost wrapper — hide Pin. */
  isRepost?: boolean
  onStartEdit?: () => void
  className?: string
}) {
  const { data: session } = authClient.useSession()
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const isOwner = Boolean(session?.user && session.user.id === post.author.id)
  const canEdit =
    isOwner && Date.now() - new Date(post.createdAt).getTime() < EDIT_WINDOW_MS
  const authorHandle = post.author.handle

  if (!session) return null

  async function onDelete() {
    await api.deletePost(post.id)
    onRemove?.()
  }

  async function togglePin() {
    if (busy) return
    setBusy(true)
    try {
      if (post.pinned) {
        await api.unpinPost(post.id)
      } else {
        await api.pinPost(post.id)
      }
      onChange?.({ ...post, pinned: !post.pinned })
    } catch {
      /* surfaced via stale state on refresh */
    } finally {
      setBusy(false)
    }
  }

  async function toggleHide() {
    if (busy) return
    setBusy(true)
    try {
      if (post.hidden) {
        await api.unhidePost(post.id)
      } else {
        await api.hidePost(post.id)
      }
      onChange?.({ ...post, hidden: !post.hidden })
    } catch {
      /* surfaced via stale state on refresh */
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        data-post-card-ignore-open
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="transparent"
                size="sm"
                aria-label="Post menu"
                iconLeft={<EllipsisHorizontalIcon />}
              />
            }
          />
          <DropdownMenu.Content align="end" sideOffset={4} className="w-40">
            {isOwner && canEdit && (
              <DropdownMenu.Item onClick={() => onStartEdit?.()}>
                <PencilSquareIcon className="size-3.5" />
                <span>Edit</span>
              </DropdownMenu.Item>
            )}
            {isOwner && !isRepost && !post.replyToId && !post.quoteOfId && (
              <DropdownMenu.Item onClick={togglePin}>
                <MapPinIcon className="size-3.5" />
                <span>{post.pinned ? "Unpin" : "Pin to profile"}</span>
              </DropdownMenu.Item>
            )}
            {isOwner && (
              <DropdownMenu.Item
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                disabled={busy}
              >
                <TrashIcon className="size-3.5" />
                <span>Delete</span>
              </DropdownMenu.Item>
            )}
            {canHide && !isOwner && (
              <DropdownMenu.Item onClick={toggleHide}>
                {post.hidden ? (
                  <EyeIcon className="size-3.5" />
                ) : (
                  <EyeSlashIcon className="size-3.5" />
                )}
                <span>{post.hidden ? "Unhide reply" : "Hide reply"}</span>
              </DropdownMenu.Item>
            )}
            {!isOwner && (
              <DropdownMenu.Item onClick={() => setReportOpen(true)}>
                <FlagIcon className="size-3.5" />
                <span>Report</span>
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this post?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onDelete}
      />
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        subjectType="post"
        subjectId={post.id}
        subjectLabel={authorHandle ? `@${authorHandle}'s post` : "this post"}
      />
    </>
  )
}
