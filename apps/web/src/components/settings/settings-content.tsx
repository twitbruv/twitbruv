import { useId, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useMe } from "../../lib/me"
import { PageLoading } from "../page-surface"
import {
  AccountSection,
  ConnectionsSection,
  DangerZone,
  DevToolsSection,
  PasskeysSection,
  PrivacySection,
  ProfileSection,
  SessionsSection,
} from "./sections"
import { SETTINGS_TABS, SETTINGS_TAB_LABELS } from "./types"
import type { SettingsTab } from "./types"

export function SettingsContent({
  initialTab,
  focusProfile,
  githubOAuth,
  currentSessionId,
  onDeleted,
}: {
  initialTab?: SettingsTab
  focusProfile?: boolean
  githubOAuth?: {
    connected?: string | null
    connectError?: string | null
  }
  currentSessionId: string | null
  onDeleted: () => void
}) {
  const { me } = useMe()
  const [tab, setTab] = useState<SettingsTab>(() => initialTab ?? "profile")
  const baseId = useId()

  if (!me) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-4 py-8">
        <PageLoading />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-row">
      <nav
        aria-labelledby={`${baseId}-heading`}
        className="flex w-44 shrink-0 flex-col border-r-neutral-strong bg-base-1 px-2 py-3 sm:w-48"
      >
        <h2
          id={`${baseId}-heading`}
          className="mb-2 px-2.5 text-sm font-semibold text-primary"
        >
          Settings
        </h2>
        <div
          role="tablist"
          aria-orientation="vertical"
          className="flex flex-col gap-0.5"
        >
          {SETTINGS_TABS.map((t) => {
            const selected = tab === t
            return (
              <button
                key={t}
                id={`${baseId}-tab-${t}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2",
                  selected
                    ? "bg-subtle text-primary"
                    : "text-secondary hover:bg-subtle/70 hover:text-primary"
                )}
              >
                {SETTINGS_TAB_LABELS[t]}
              </button>
            )
          })}
        </div>
      </nav>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {tab === "profile" && (
          <ProfileSection focusProfileFields={focusProfile} />
        )}
        {tab === "account" && (
          <>
            <AccountSection email={me.email} />
            <div className="mt-10">
              <PasskeysSection />
            </div>
          </>
        )}
        {tab === "sessions" && (
          <SessionsSection currentSessionId={currentSessionId} />
        )}
        {tab === "privacy" && <PrivacySection />}
        {tab === "connections" && (
          <ConnectionsSection
            oauthConnected={githubOAuth?.connected}
            oauthConnectError={githubOAuth?.connectError}
          />
        )}
        {tab === "danger" && <DangerZone onDeleted={onDeleted} />}
        {tab === "dev" && <DevToolsSection />}
      </div>
    </div>
  )
}
