import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import {
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  FlagIcon,
  NoSymbolIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
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
        <EnvelopeIcon className="size-4" />
      </Button>
      <Button
        size="sm"
        variant={v.following ? "outline" : "primary"}
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
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          render={
            <Button size="sm" variant="transparent" aria-label="more actions">
              <EllipsisHorizontalIcon className="size-4" />
            </Button>
          }
        />
        <DropdownMenu.Content align="end" sideOffset={4} className="w-40">
          <DropdownMenu.Item
            icon={<SpeakerXMarkIcon className="size-3.5" />}
            onClick={() =>
              run(
                "mute",
                !v.muting,
                () => (v.muting ? api.unmute(h) : api.mute(h)),
                "muting"
              )
            }
          >
            {v.muting ? "Unmute" : "Mute feed"}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={<FlagIcon className="size-3.5" />}
            onClick={() => setReportOpen(true)}
          >
            Report
          </DropdownMenu.Item>
          <DropdownMenu.Item
            variant="danger"
            icon={<NoSymbolIcon className="size-3.5" />}
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
            {v.blocking ? "Unblock" : "Block"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
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
