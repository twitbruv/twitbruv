import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import {
  DotsThreeIcon,
  EnvelopeIcon,
  FlagIcon,
  ProhibitIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { trackedAction } from "../lib/analytics"
import { api } from "../lib/api"
import { ReportDialog } from "./report-dialog"
import type { PublicProfile } from "../lib/api"

export function ProfileActions({
  profile,
  onChange,
}: {
  profile: PublicProfile
  onChange: (next: PublicProfile) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<
    null | "follow" | "block" | "mute" | "message"
  >(null)
  const [reportOpen, setReportOpen] = useState(false)

  if (!profile.viewer || !profile.handle) return null
  const h = profile.handle
  const v = profile.viewer

  async function startConversation() {
    if (busy) return
    setBusy("message")
    try {
      const { id } = await trackedAction(
        "dm_started",
        () => api.dmStart(profile.id),
        (res) => ({ target_user_id: profile.id, conversation_id: res.id }),
      )
      router.navigate({
        to: "/inbox/$conversationId",
        params: { conversationId: id },
      })
    } catch {
      setBusy(null)
    }
  }

  async function run<TKey extends "follow" | "block" | "mute">(
    key: TKey,
    next: boolean,
    op: () => Promise<unknown>,
    flag: keyof NonNullable<PublicProfile["viewer"]>,
    delta = 0
  ) {
    setBusy(key)
    const prev = profile
    const updated: PublicProfile = {
      ...profile,
      counts: {
        ...profile.counts,
        followers:
          profile.counts.followers + (flag === "following" ? delta : 0),
      },
      viewer: { ...v, [flag]: next },
    }
    onChange(updated)
    try {
      await op()
    } catch {
      onChange(prev)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        aria-label="message"
        disabled={busy !== null || v.blocking}
        onClick={startConversation}
      >
        <EnvelopeIcon size={16} />
      </Button>
      <Button
        size="sm"
        variant={v.following ? "outline" : "default"}
        disabled={busy !== null || v.blocking}
        onClick={() =>
          run(
            "follow",
            !v.following,
            () =>
              v.following
                ? trackedAction("user_unfollowed", () => api.unfollow(h), () => ({
                    target_user_id: profile.id,
                    target_handle: h,
                  }))
                : trackedAction("user_followed", () => api.follow(h), () => ({
                    target_user_id: profile.id,
                    target_handle: h,
                  })),
            "following",
            v.following ? -1 : 1
          )
        }
      >
        {busy === "follow" ? "…" : v.following ? "Following" : "Follow"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost" aria-label="more actions">
              <DotsThreeIcon size={16} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={4} className="w-40">
          <DropdownMenuItem
            onClick={() =>
              run(
                "mute",
                !v.muting,
                () =>
                  v.muting
                    ? trackedAction("user_unmuted", () => api.unmute(h), () => ({
                        target_user_id: profile.id,
                        target_handle: h,
                      }))
                    : trackedAction("user_muted", () => api.mute(h), () => ({
                        target_user_id: profile.id,
                        target_handle: h,
                        scope: "feed",
                      })),
                "muting"
              )
            }
          >
            <SpeakerSlashIcon size={14} />
            <span>{v.muting ? "Unmute" : "Mute feed"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setReportOpen(true)}>
            <FlagIcon size={14} />
            <span>Report</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (!v.blocking && !confirm(`Block @${h}?`)) return
              run(
                "block",
                !v.blocking,
                () =>
                  v.blocking
                    ? trackedAction("user_unblocked", () => api.unblock(h), () => ({
                        target_user_id: profile.id,
                        target_handle: h,
                      }))
                    : trackedAction("user_blocked", () => api.block(h), () => ({
                        target_user_id: profile.id,
                        target_handle: h,
                      })),
                "blocking"
              )
            }}
          >
            <ProhibitIcon size={14} />
            <span>{v.blocking ? "Unblock" : "Block"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        subjectType="user"
        subjectId={profile.id}
        subjectLabel={`@${h}`}
      />
    </div>
  )
}
