import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import {
  IconBan,
  IconDots,
  IconFlag,
  IconMail,
  IconVolumeOff,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
      const { id } = await api.dmStart(profile.id)
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
        <IconMail size={16} stroke={1.75} />
      </Button>
      <Button
        size="sm"
        variant={v.following ? "outline" : "default"}
        disabled={busy !== null || v.blocking}
        onClick={() =>
          run(
            "follow",
            !v.following,
            () => (v.following ? api.unfollow(h) : api.follow(h)),
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
              <IconDots size={16} stroke={1.75} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={4} className="w-40">
          <DropdownMenuItem
            onClick={() =>
              run(
                "mute",
                !v.muting,
                () => (v.muting ? api.unmute(h) : api.mute(h)),
                "muting"
              )
            }
          >
            <IconVolumeOff size={14} stroke={1.75} />
            <span>{v.muting ? "Unmute" : "Mute feed"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setReportOpen(true)}>
            <IconFlag size={14} stroke={1.75} />
            <span>Report</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (!v.blocking && !confirm(`Block @${h}?`)) return
              run(
                "block",
                !v.blocking,
                () => (v.blocking ? api.unblock(h) : api.block(h)),
                "blocking"
              )
            }}
          >
            <IconBan size={14} stroke={1.75} />
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
