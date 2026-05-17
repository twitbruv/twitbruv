import {
  AtSymbolIcon,
  GlobeAltIcon,
  UsersIcon,
} from "@heroicons/react/16/solid"
import type { UploadedMedia } from "../../lib/media"
import type { Post } from "../../lib/api"

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

export const MAX_ATTACHMENTS = 4

export const REPLY_OPTIONS = [
  { value: "anyone" as const, label: "Everyone", icon: GlobeAltIcon },
  { value: "following" as const, label: "Following", icon: UsersIcon },
  { value: "mentioned" as const, label: "Mentions", icon: AtSymbolIcon },
] as const

export const POLL_DURATION_CHOICES = [
  { label: "5 minutes", minutes: 5 },
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 60 * 24 },
  { label: "3 days", minutes: 60 * 24 * 3 },
  { label: "7 days", minutes: 60 * 24 * 7 },
] as const

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface PendingAttachment {
  tempId: string
  status: "uploading" | "ready" | "failed"
  previewUrl: string
  media?: UploadedMedia
  altText: string
  error?: string
  removing?: boolean
}

export interface PollOptionState {
  id: string
  value: string
}

export interface PollState {
  options: Array<PollOptionState>
  durationMinutes: number
  allowMultiple: boolean
}

export interface ComposeProps {
  onCreated?: (post: Post) => void
  replyToId?: string
  quoteOfId?: string
  quoted?: Post
  placeholder?: string
  collapsible?: boolean
  autoFocus?: boolean
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

export function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createPollOption(value = ""): PollOptionState {
  return { id: createId(), value }
}

export function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight}px`
}
