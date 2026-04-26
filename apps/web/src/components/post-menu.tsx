import { useState } from "react"
import {
  DotsThreeIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  PencilIcon,
  PushPinIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { trackedAction } from "../lib/analytics"
import { ApiError, api } from "../lib/api"
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
  const [reportOpen, setReportOpen] = useState(false)
  const isOwner = Boolean(session?.user && session.user.id === post.author.id)
  const canEdit =
    isOwner && Date.now() - new Date(post.createdAt).getTime() < EDIT_WINDOW_MS
  const authorHandle = post.author.handle

  if (!session) return null

  async function onDelete() {
    if (busy) return
    if (!confirm("Delete this post?")) return
    setBusy(true)
    try {
      await trackedAction(
        "post_deleted",
        () => api.deletePost(post.id),
        () => ({
          post_id: post.id,
          author_is_self: post.author.id === session?.user.id,
        }),
      )
      onRemove?.()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "delete failed")
    } finally {
      setBusy(false)
    }
  }

  async function togglePin() {
    if (busy) return
    setBusy(true)
    try {
      if (post.pinned) {
        await trackedAction(
          "post_unpinned",
          () => api.unpinPost(post.id),
          () => ({ post_id: post.id }),
        )
      } else {
        await trackedAction(
          "post_pinned",
          () => api.pinPost(post.id),
          () => ({ post_id: post.id }),
        )
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
        await trackedAction(
          "post_unhidden",
          () => api.unhidePost(post.id),
          () => ({ post_id: post.id }),
        )
      } else {
        await trackedAction(
          "post_hidden",
          () => api.hidePost(post.id),
          () => ({ post_id: post.id }),
        )
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Post menu"
                className="size-5"
              >
                <DotsThreeIcon size={12} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" sideOffset={4} className="w-40">
            {isOwner && canEdit && (
              <DropdownMenuItem onClick={() => onStartEdit?.()}>
                <PencilIcon size={14} />
                <span>Edit</span>
              </DropdownMenuItem>
            )}
            {isOwner && !isRepost && !post.replyToId && !post.quoteOfId && (
              <DropdownMenuItem onClick={togglePin}>
                <PushPinIcon size={14} />
                <span>{post.pinned ? "Unpin" : "Pin to profile"}</span>
              </DropdownMenuItem>
            )}
            {isOwner && (
              <DropdownMenuItem
                variant="destructive"
                onClick={onDelete}
                disabled={busy}
              >
                <TrashIcon size={14} />
                <span>Delete</span>
              </DropdownMenuItem>
            )}
            {canHide && !isOwner && (
              <DropdownMenuItem onClick={toggleHide}>
                {post.hidden ? (
                  <EyeIcon size={14} />
                ) : (
                  <EyeSlashIcon size={14} />
                )}
                <span>{post.hidden ? "Unhide reply" : "Hide reply"}</span>
              </DropdownMenuItem>
            )}
            {!isOwner && (
              <DropdownMenuItem onClick={() => setReportOpen(true)}>
                <FlagIcon size={14} />
                <span>Report</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
