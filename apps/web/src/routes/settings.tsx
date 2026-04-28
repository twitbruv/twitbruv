import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { updateProfileSchema } from "@workspace/validators"
import { Textarea } from "@workspace/ui/components/textarea"
import { Avatar } from "@workspace/ui/components/avatar"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { qk } from "../lib/query-keys"
import { API_URL } from "../lib/env"
import { useMe } from "../lib/me"
import { ClaimHandle } from "../components/claim-handle"
import { AvatarUpload } from "../components/avatar-upload"
import { BannerUpload } from "../components/banner-upload"
import { usePageHeader } from "../components/app-page-header"
import { PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import {
  UnderlineTabButton,
  UnderlineTabRow,
} from "../components/underline-tab-row"
import { VerifiedBadge } from "../components/verified-badge"

type SettingsTab =
  | "profile"
  | "account"
  | "sessions"
  | "privacy"
  | "connections"
  | "danger"
  | "dev"

const SETTINGS_TABS: ReadonlyArray<SettingsTab> = [
  "profile",
  "account",
  "sessions",
  "privacy",
  "connections",
  "danger",
  ...(import.meta.env.DEV ? (["dev"] as const) : []),
]

type SettingsSearch = { tab?: SettingsTab }

export const Route = createFileRoute("/settings")({
  component: Settings,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const raw = search.tab
    return {
      tab:
        typeof raw === "string" &&
        (SETTINGS_TABS as ReadonlyArray<string>).includes(raw)
          ? (raw as SettingsTab)
          : undefined,
    }
  },
})

function Settings() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const { me, setMe } = useMe()
  const { tab: tabSearch } = Route.useSearch()
  const tab: SettingsTab = tabSearch ?? "profile"
  const setTab = (next: SettingsTab) =>
    navigate({
      to: "/settings",
      search: { tab: next === "profile" ? undefined : next },
      replace: true,
      resetScroll: false,
    })

  useEffect(() => {
    if (isPending) return
    if (!session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const appHeader = useMemo(
    () => (!me ? null : { title: "Settings" as const }),
    [me]
  )
  usePageHeader(appHeader)

  if (isPending || !me) {
    return (
      <PageFrame>
        <div className="px-4 py-8">
          <PageLoading />
        </div>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <div className="px-4 py-8">
        {!me.handle && (
          <div className="mt-6">
            <ClaimHandle onClaimed={(h) => setMe({ ...me, handle: h })} />
          </div>
        )}

        <UnderlineTabRow className="mt-6 min-w-0 overflow-x-auto">
          <UnderlineTabButton
            active={tab === "profile"}
            onClick={() => setTab("profile")}
            className="shrink-0 px-3"
          >
            Profile
          </UnderlineTabButton>
          <UnderlineTabButton
            active={tab === "account"}
            onClick={() => setTab("account")}
            className="shrink-0 px-3"
          >
            Account
          </UnderlineTabButton>
          <UnderlineTabButton
            active={tab === "sessions"}
            onClick={() => setTab("sessions")}
            className="shrink-0 px-3"
          >
            Sessions
          </UnderlineTabButton>
          <UnderlineTabButton
            active={tab === "privacy"}
            onClick={() => setTab("privacy")}
            className="shrink-0 px-3"
          >
            Privacy
          </UnderlineTabButton>
          <UnderlineTabButton
            active={tab === "connections"}
            onClick={() => setTab("connections")}
            className="shrink-0 px-3"
          >
            Connections
          </UnderlineTabButton>
          <UnderlineTabButton
            active={tab === "danger"}
            onClick={() => setTab("danger")}
            className="shrink-0 px-3"
          >
            Danger zone
          </UnderlineTabButton>
          {import.meta.env.DEV && (
            <UnderlineTabButton
              active={tab === "dev"}
              onClick={() => setTab("dev")}
              className="shrink-0 px-3"
            >
              Dev Tools
            </UnderlineTabButton>
          )}
        </UnderlineTabRow>

        <div className="mt-6">
          {tab === "profile" && <ProfileSection />}
          {tab === "account" && <AccountSection email={me.email} />}
          {tab === "sessions" && (
            <SessionsSection currentSessionId={session?.session.id ?? null} />
          )}
          {tab === "privacy" && <PrivacySection />}
          {tab === "connections" && <ConnectionsSection />}
          {tab === "danger" && (
            <DangerZone onDeleted={() => router.navigate({ to: "/" })} />
          )}
          {tab === "dev" && <DevToolsSection />}
        </div>
      </div>
    </PageFrame>
  )
}

function ProfileSection() {
  const { me, setMe } = useMe()
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [location, setLocation] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!me) return
    setDisplayName(me.displayName ?? "")
    setBio(me.bio ?? "")
    setLocation(me.location ?? "")
    setWebsiteUrl(me.websiteUrl ?? "")
  }, [me])

  // After the page renders with the user's data, honor the URL hash
  // (e.g. /settings#profile from the "Edit profile" button) by scrolling
  // the matching section into view and focusing the first input in it.
  useEffect(() => {
    if (!me || typeof window === "undefined") return
    const id = window.location.hash.slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    const firstInput = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea"
    )
    firstInput?.focus({ preventScroll: true })
  }, [me])

  if (!me) return null

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    const parsed = updateProfileSchema.safeParse({
      displayName,
      bio,
      location,
      websiteUrl,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue.path[0]
      setStatus(field ? `${String(field)}: ${issue.message}` : issue.message)
      return
    }
    try {
      const { user: next } = await api.updateMe(parsed.data)
      setMe(next)
      setStatus("saved")
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : "save failed")
    }
  }

  async function updateMedia(patch: {
    avatarUrl?: string | null
    bannerUrl?: string | null
  }) {
    try {
      // api.updateMe accepts empty string to clear; null gets normalized to empty.
      const { user } = await api.updateMe({
        ...(patch.avatarUrl !== undefined
          ? { avatarUrl: patch.avatarUrl ?? "" }
          : {}),
        ...(patch.bannerUrl !== undefined
          ? { bannerUrl: patch.bannerUrl ?? "" }
          : {}),
      })
      setMe(user)
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "update failed")
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold">Profile media</h2>
        <BannerUpload
          currentUrl={me.bannerUrl}
          onChange={(url) => updateMedia({ bannerUrl: url })}
        />
        <AvatarUpload
          currentUrl={me.avatarUrl}
          displayName={me.displayName ?? me.handle}
          onChange={(url) => updateMedia({ avatarUrl: url })}
        />
      </section>

      <form
        onSubmit={onSave}
        id="profile"
        className="border-border flex scroll-mt-4 flex-col gap-3 border-t pt-6"
      >
        <h2 className="text-sm font-semibold">Profile details</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            className="min-h-20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="websiteUrl">Website</Label>
          <Input
            id="websiteUrl"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
        {status && <p className="text-muted-foreground text-xs">{status}</p>}
        <Button type="submit">Save</Button>
      </form>
    </div>
  )
}

function AccountSection({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [pwBusy, setPwBusy] = useState(false)
  const [pwStatus, setPwStatus] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState("")
  const [emBusy, setEmBusy] = useState(false)
  const [emStatus, setEmStatus] = useState<string | null>(null)

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 10) {
      setPwStatus("New password must be at least 10 characters.")
      return
    }
    setPwBusy(true)
    setPwStatus(null)
    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (res.error) {
        setPwStatus(res.error.message ?? "couldn't change password")
      } else {
        setPwStatus("password updated — other sessions signed out")
        setCurrentPassword("")
        setNewPassword("")
      }
    } finally {
      setPwBusy(false)
    }
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail || newEmail === email) return
    setEmBusy(true)
    setEmStatus(null)
    try {
      const res = await authClient.changeEmail({ newEmail })
      setEmStatus(
        res.error
          ? (res.error.message ?? "couldn't update email")
          : "verification email sent — confirm to switch"
      )
    } finally {
      setEmBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-sm font-semibold">Account</h2>

      <form onSubmit={changeEmail} className="flex flex-col gap-2">
        <Label htmlFor="newEmail">Email</Label>
        <p className="text-muted-foreground text-xs">Currently {email}.</p>
        <Input
          id="newEmail"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="new@example.com"
        />
        {emStatus && (
          <p className="text-muted-foreground text-xs">{emStatus}</p>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={emBusy || !newEmail || newEmail === email}
        >
          Send verification
        </Button>
      </form>

      <form onSubmit={changePassword} className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Change password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
        />
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (10+ characters)"
        />
        {pwStatus && (
          <p className="text-muted-foreground text-xs">{pwStatus}</p>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={pwBusy || !currentPassword || !newPassword}
        >
          Update password
        </Button>
      </form>
    </section>
  )
}

interface SessionRow {
  id: string
  token?: string
  createdAt?: string | Date
  ipAddress?: string | null
  userAgent?: string | null
}

function SessionsSection({
  currentSessionId,
}: {
  currentSessionId: string | null
}) {
  const [sessions, setSessions] = useState<Array<SessionRow> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const res = await authClient.listSessions()
      const data = (res.data ?? []) as Array<SessionRow>
      setSessions(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load sessions")
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  async function revoke(token: string) {
    if (busy) return
    setBusy(true)
    try {
      await authClient.revokeSession({ token })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function revokeOthers() {
    if (busy) return
    if (!window.confirm("Sign out everywhere except this device?")) return
    setBusy(true)
    try {
      await authClient.revokeOtherSessions()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Active sessions</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={revokeOthers}
        >
          Sign out other devices
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {!sessions && <p className="text-muted-foreground text-xs">loading…</p>}
      {sessions && sessions.length === 0 && (
        <p className="text-muted-foreground text-xs">No sessions found.</p>
      )}
      {sessions && sessions.length > 0 && (
        <ul className="divide-border border-border divide-y rounded-md border">
          {sessions.map((s) => {
            const isCurrent = s.id === currentSessionId
            return (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {s.userAgent ? truncate(s.userAgent, 60) : "Unknown device"}
                    {isCurrent && (
                      <span className="text-muted-foreground ml-1 text-[10px] tracking-wider uppercase">
                        this device
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {s.ipAddress && <span>{s.ipAddress} · </span>}
                    {s.createdAt && (
                      <span>
                        started {new Date(s.createdAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                {!isCurrent && s.token && (
                  <Button
                    size="sm"
                    variant="transparent"
                    disabled={busy}
                    onClick={() => revoke(s.token!)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PrivacySection() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<"blocks" | "mutes">("blocks")
  const [busyId, setBusyId] = useState<string | null>(null)

  const blocksQuery = useQuery({
    queryKey: qk.blocks(),
    queryFn: async () => (await api.blocks()).users,
    enabled: tab === "blocks",
  })

  const mutesQuery = useQuery({
    queryKey: qk.mutes(),
    queryFn: async () => (await api.mutes()).users,
    enabled: tab === "mutes",
  })

  async function unblock(handle: string, id: string) {
    setBusyId(id)
    try {
      await api.unblock(handle)
      await qc.invalidateQueries({ queryKey: qk.blocks() })
    } finally {
      setBusyId(null)
    }
  }

  async function unmute(handle: string, id: string) {
    setBusyId(id)
    try {
      await api.unmute(handle)
      await qc.invalidateQueries({ queryKey: qk.mutes() })
    } finally {
      setBusyId(null)
    }
  }

  const blocksCount = blocksQuery.data?.length ?? 0
  const mutesCount = mutesQuery.data?.length ?? 0

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Privacy</h2>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={tab === "blocks" ? "outline" : "transparent"}
          onClick={() => setTab("blocks")}
        >
          Blocked
          {blocksQuery.data !== undefined && blocksCount > 0 && (
            <span className="ml-1.5 text-xs opacity-80">{blocksCount}</span>
          )}
        </Button>
        <Button
          size="sm"
          variant={tab === "mutes" ? "outline" : "transparent"}
          onClick={() => setTab("mutes")}
        >
          Muted
          {mutesQuery.data !== undefined && mutesCount > 0 && (
            <span className="ml-1.5 text-xs opacity-80">{mutesCount}</span>
          )}
        </Button>
      </div>
      {tab === "blocks" && blocksQuery.isError && (
        <p className="text-destructive text-xs">
          {blocksQuery.error instanceof ApiError
            ? blocksQuery.error.message
            : "couldn't load blocks"}
        </p>
      )}
      {tab === "blocks" && !blocksQuery.isError && (
        <PrivacyList
          users={blocksQuery.isPending ? null : (blocksQuery.data ?? [])}
          emptyText="You haven't blocked anyone."
          renderTrailing={(u) => (
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === u.id || !u.handle}
              onClick={() => u.handle && unblock(u.handle, u.id)}
            >
              Unblock
            </Button>
          )}
          renderMeta={(u) =>
            `Blocked ${new Date(u.blockedAt).toLocaleDateString()}`
          }
        />
      )}
      {tab === "mutes" && mutesQuery.isError && (
        <p className="text-destructive text-xs">
          {mutesQuery.error instanceof ApiError
            ? mutesQuery.error.message
            : "couldn't load mutes"}
        </p>
      )}
      {tab === "mutes" && !mutesQuery.isError && (
        <PrivacyList
          users={mutesQuery.isPending ? null : (mutesQuery.data ?? [])}
          emptyText="You haven't muted anyone."
          renderTrailing={(u) => (
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === u.id || !u.handle}
              onClick={() => u.handle && unmute(u.handle, u.id)}
            >
              Unmute
            </Button>
          )}
          renderMeta={(u) =>
            `${labelForScope(u.scope)} · ${new Date(u.mutedAt).toLocaleDateString()}`
          }
        />
      )}
    </section>
  )
}

function labelForScope(scope: "feed" | "notifications" | "both"): string {
  if (scope === "both") return "Feed + notifications"
  if (scope === "notifications") return "Notifications only"
  return "Feed only"
}

function PrivacyList<
  T extends {
    id: string
    handle: string | null
    displayName: string | null
    avatarUrl: string | null
    isVerified: boolean
    role: "user" | "admin" | "owner"
  },
>({
  users,
  emptyText,
  renderTrailing,
  renderMeta,
}: {
  users: Array<T> | null
  emptyText: string
  renderTrailing: (u: T) => React.ReactNode
  renderMeta: (u: T) => string
}) {
  if (users === null) {
    return <p className="text-muted-foreground text-xs">loading…</p>
  }
  if (users.length === 0) {
    return <p className="text-muted-foreground text-xs">{emptyText}</p>
  }
  return (
    <ul className="divide-border border-border divide-y rounded-md border">
      {users.map((u) => (
        <li
          key={u.id}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Avatar
              initial={(u.displayName || u.handle || "?")
                .slice(0, 1)
                .toUpperCase()}
              src={u.avatarUrl}
              className="size-8 shrink-0"
            />
            <div className="min-w-0">
              {u.handle ? (
                <Link
                  to="/$handle"
                  params={{ handle: u.handle }}
                  className="flex items-center gap-1 text-sm font-medium hover:underline"
                >
                  <span className="truncate">
                    {u.displayName ?? `@${u.handle}`}
                  </span>
                  {u.isVerified && <VerifiedBadge size={13} role={u.role} />}
                </Link>
              ) : (
                <span className="flex items-center gap-1 text-sm font-medium">
                  <span className="truncate">
                    {u.displayName ?? "Unknown user"}
                  </span>
                  {u.isVerified && <VerifiedBadge size={13} role={u.role} />}
                </span>
              )}
              <p className="text-muted-foreground truncate text-xs">
                {renderMeta(u)}
              </p>
            </div>
          </div>
          {renderTrailing(u)}
        </li>
      ))}
    </ul>
  )
}

function DangerZone({ onDeleted }: { onDeleted: () => void }) {
  const { me } = useMe()
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiredText = me?.handle ?? me?.email ?? ""
  const matches = confirm === requiredText

  async function deleteMe() {
    if (!matches || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await authClient.deleteUser()
      if (res.error) {
        setError(res.error.message ?? "couldn't delete account")
        return
      }
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-destructive text-sm font-semibold">Danger zone</h2>
      <p className="text-muted-foreground text-xs">
        Deleting your account is permanent. Posts, articles, and DMs you
        authored will be removed. Type{" "}
        <code className="bg-muted rounded px-1">{requiredText}</code> to
        confirm.
      </p>
      <Input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={requiredText}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button
        variant="danger"
        size="sm"
        disabled={!matches || busy}
        onClick={deleteMe}
      >
        Delete my account
      </Button>
    </section>
  )
}

function ConnectionsSection() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<"refresh" | "disconnect" | "toggle" | null>(
    null
  )
  const [status, setStatus] = useState<string | null>(null)

  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null
  const connected = search?.get("connected")
  const connectError = search?.get("connect_error")

  const { data: state, isPending } = useQuery({
    queryKey: qk.connectors.githubMe(),
    queryFn: () => api.connectorsGithubMe(),
  })

  async function refresh() {
    if (busy) return
    setBusy("refresh")
    setStatus(null)
    try {
      const r = await api.connectorsGithubRefresh()
      if (r.stale)
        setStatus("Refresh hit GitHub's limit — showing last good data.")
      else setStatus("Refreshed.")
      await qc.invalidateQueries({ queryKey: qk.connectors.githubMe() })
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "refresh failed")
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    if (busy) return
    if (
      !window.confirm(
        "Disconnect GitHub? Your contributions will be removed from your profile."
      )
    ) {
      return
    }
    setBusy("disconnect")
    try {
      await api.connectorsGithubDisconnect()
      await qc.invalidateQueries({ queryKey: qk.connectors.githubMe() })
      setStatus("Disconnected.")
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "disconnect failed")
    } finally {
      setBusy(null)
    }
  }

  async function toggleVisibility(next: boolean) {
    if (busy || state?.connected !== true) return
    setBusy("toggle")
    try {
      await api.connectorsGithubSetVisibility(next)
      await qc.invalidateQueries({ queryKey: qk.connectors.githubMe() })
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "couldn't update")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Connections</h2>
      <p className="text-muted-foreground text-xs">
        Link external accounts to enrich your profile. We never post on your
        behalf.
      </p>

      {connected === "github" && (
        <div className="border-border bg-muted/40 rounded-md border px-3 py-2 text-xs">
          GitHub connected.
        </div>
      )}
      {connectError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
          GitHub connection failed: {connectError}
        </div>
      )}

      <div className="border-border rounded-md border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">GitHub</div>
            {isPending && <PageLoading className="py-8" label="Loading…" />}
            {state && state.configured === false && (
              <p className="text-muted-foreground text-xs">
                The server isn't configured for GitHub connections yet.
              </p>
            )}
            {state?.connected === false && state.configured && (
              <p className="text-muted-foreground text-xs">
                Show your contributions graph and pinned repos on your profile.
              </p>
            )}
            {state?.connected === true && (
              <div className="text-muted-foreground space-y-1 text-xs">
                <div>
                  Connected as{" "}
                  <a
                    href={`https://github.com/${state.login}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground font-medium hover:underline"
                  >
                    @{state.login}
                  </a>
                </div>
                {state.refreshedAt && (
                  <div>
                    Last synced {new Date(state.refreshedAt).toLocaleString()}
                  </div>
                )}
                {state.needsReconnect && (
                  <div className="text-destructive">
                    Token revoked — reconnect to resume.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {state?.connected === true ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={refresh}
                >
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              state?.configured && (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<a href={api.connectorsGithubStartUrl()} />}
                >
                  Connect
                </Button>
              )
            )}
          </div>
        </div>
        {state?.connected === true && (
          <label className="mt-3 flex items-center gap-2 text-xs">
            <Switch
              checked={state.showOnProfile}
              onCheckedChange={(checked) => toggleVisibility(checked)}
              disabled={busy !== null}
            />
            Show on my profile
          </label>
        )}
        {status && (
          <p className="text-muted-foreground mt-2 text-xs">{status}</p>
        )}
      </div>
    </section>
  )
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

function DevToolsSection() {
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSeed = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`${API_URL}/api/dev/seed`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json()
      if (data.ok) {
        setStatus(
          data.message +
            (data.counts
              ? ` (${data.counts.users} users, ${data.counts.posts} posts, ${data.counts.images} images)`
              : "")
        )
      } else {
        setStatus("Failed to seed")
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : "unknown"}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-primary">Seed Data</h3>
        <p className="mt-1 text-xs text-tertiary">
          Create fake users, posts with images, replies, reposts, and quote
          tweets for testing. Also creates a few posts for your account.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSeed}
          loading={loading}
          className="mt-3"
        >
          Seed posts
        </Button>
        {status && <p className="mt-2 text-xs text-secondary">{status}</p>}
      </div>
    </section>
  )
}
