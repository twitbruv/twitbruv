import {
  ArrowPathIcon,
  PhoneIcon,
  QuestionMarkCircleIcon,
  TvIcon,
} from "@heroicons/react/24/outline"
import { Link } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { updateProfileSchema } from "@workspace/validators"
import { Avatar } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { useMe } from "../../lib/me"
import { qk } from "../../lib/query-keys"
import { API_URL } from "../../lib/env"
import { authClient } from "../../lib/auth"
import { ApiError, api } from "../../lib/api"
import { ClaimHandle } from "../claim-handle"
import { AvatarUpload } from "../avatar-upload"
import { BannerUpload } from "../banner-upload"
import { VerifiedBadge } from "../verified-badge"
import { PageLoading } from "../page-surface"
import {
  SettingsSection,
  SettingsSectionDescription,
  SettingsSectionTitle,
} from "./settings-section-primitives"

interface SessionRow {
  id: string
  token?: string
  createdAt?: string | Date
  ipAddress?: string | null
  userAgent?: string | null
}

type SessionDeviceKind = "desktop" | "phone" | "tablet" | "unknown"

function sessionDeviceKindFromUserAgent(
  ua: string | null | undefined
): SessionDeviceKind {
  if (!ua?.trim()) return "unknown"
  const lower = ua.toLowerCase()
  if (
    /ipad|tablet|playbook|silk|kindle|sm-t\d|tab\b|nexus 7|nexus 10/.test(
      lower
    ) ||
    (/android/.test(lower) && !/mobile/.test(lower))
  ) {
    return "tablet"
  }
  if (
    /mobile|iphone|ipod|android.*mobile|webos|blackberry|opera mini|opera mobi|iemobile|palm/.test(
      lower
    )
  ) {
    return "phone"
  }
  return "desktop"
}

function SessionDeviceIcon({ kind }: { kind: SessionDeviceKind }) {
  const cls = "size-5 shrink-0 text-secondary"
  if (kind === "phone") return <PhoneIcon className={cls} aria-hidden />
  if (kind === "tablet") return <PhoneIcon className={cls} aria-hidden />
  if (kind === "desktop") return <TvIcon className={cls} aria-hidden />
  return <QuestionMarkCircleIcon className={cls} aria-hidden />
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

export function ProfileSection({
  focusProfileFields,
}: {
  focusProfileFields?: boolean
}) {
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

  useEffect(() => {
    if (!me || !focusProfileFields) return
    const el = document.getElementById("settings-profile-details")
    if (!el) return
    const firstInput = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea"
    )
    queueMicrotask(() => firstInput?.focus({ preventScroll: true }))
  }, [me, focusProfileFields])

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
    <div className="flex flex-col gap-2">
      {!me.handle && (
        <ClaimHandle onClaimed={(h) => setMe({ ...me, handle: h })} />
      )}
      <section className="relative">
        <BannerUpload
          currentUrl={me.bannerUrl}
          onChange={(url) => updateMedia({ bannerUrl: url })}
        />
        <div className="bg-card/75 dark:bg-card/35 relative z-1 -mt-8 w-max rounded-2xl p-5">
          <div className="-mt-16 flex items-end justify-between gap-4">
            <AvatarUpload
              currentUrl={me.avatarUrl}
              displayName={me.displayName ?? me.handle}
              onChange={(url) => updateMedia({ avatarUrl: url })}
            />
          </div>
        </div>
      </section>

      <form
        id="settings-profile-details"
        onSubmit={onSave}
        className="flex scroll-mt-4 flex-col gap-3 border-neutral pt-0"
      >
        <h2 className="text-sm font-semibold text-primary">Profile details</h2>
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
            rows={4}
            className="min-h-20 resize-none"
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
        {status && <p className="text-xs text-tertiary">{status}</p>}
        <Button type="submit">Save</Button>
      </form>
    </div>
  )
}

export function AccountSection({ email }: { email: string }) {
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
    <SettingsSection>
      <SettingsSectionTitle>Account</SettingsSectionTitle>

      <form onSubmit={changeEmail} className="flex flex-col gap-2">
        <div className="">
          <Label htmlFor="newEmail">Email</Label>
          <p className="text-muted-foreground text-xs">Currently {email}.</p>
        </div>
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
          className="mt-1"
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
          className="mt-1"
        >
          Update password
        </Button>
      </form>
    </SettingsSection>
  )
}

type UserPasskeyRow = {
  id: string
  name?: string | null
  createdAt?: string | Date | null
}

export function PasskeysSection() {
  const [keys, setKeys] = useState<Array<UserPasskeyRow> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pkName, setPkName] = useState("")
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [supportsPk, setSupportsPk] = useState(false)

  useEffect(() => {
    setSupportsPk(
      typeof window !== "undefined" &&
        typeof PublicKeyCredential !== "undefined"
    )
  }, [])

  async function refresh() {
    try {
      setError(null)
      const res = await authClient.passkey.listUserPasskeys({})
      if (res.error) {
        throw new Error(res.error.message ?? "couldn't load passkeys")
      }
      const raw = res.data
      const rows = Array.isArray(raw) ? (raw as Array<UserPasskeyRow>) : []
      setKeys(rows)
    } catch (e) {
      setKeys([])
      setError(e instanceof Error ? e.message : "couldn't load passkeys")
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  async function addPasskey(e: React.FormEvent) {
    e.preventDefault()
    if (busy || typeof window === "undefined") return
    setBusy(true)
    try {
      const res = await authClient.passkey.addPasskey({
        name: pkName.trim() || undefined,
      })
      if (res.error)
        throw new Error(res.error.message ?? "couldn't register passkey")
      setPkName("")
      toast.success("Passkey added.")
      await refresh()
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "couldn't register passkey"
      )
    } finally {
      setBusy(false)
    }
  }

  async function removePasskey(id: string) {
    if (
      busy ||
      typeof window === "undefined" ||
      !window.confirm("Remove this passkey from your account?")
    ) {
      return
    }
    setBusy(true)
    try {
      const res = await authClient.passkey.deletePasskey({ id })
      if (res.error) throw new Error(res.error.message ?? "couldn't remove")
      toast.success("Passkey removed.")
      await refresh()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "couldn't remove")
    } finally {
      setBusy(false)
    }
  }

  async function saveRename(id: string) {
    const name = renameValue.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const res = await authClient.passkey.updatePasskey({
        id,
        name,
      })
      if (res.error) throw new Error(res.error.message ?? "couldn't update")
      toast.success("Passkey renamed.")
      setRenameId(null)
      setRenameValue("")
      await refresh()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "couldn't update")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection>
      <SettingsSectionTitle>Passkeys</SettingsSectionTitle>
      <p className="text-xs text-tertiary">
        Sign in without a password on supported devices using Touch ID, Face ID,
        Windows Hello, or a security key.
      </p>
      {!supportsPk ? (
        <p className="text-muted-foreground text-xs">
          Your browser doesn't support WebAuthn passkeys.
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {!keys ? (
        <p className="text-muted-foreground text-xs">loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No passkeys yet. Register one below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((p) => {
            const title =
              (p.name && p.name.trim()) || `Passkey (${p.id.slice(0, 8)})`
            const created =
              p.createdAt != null
                ? new Date(p.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : null
            const editing = renameId === p.id
            return (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-2xl bg-base-0 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 dark:bg-base-2"
              >
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                      <Label htmlFor={`pk-rename-${p.id}`} className="sr-only">
                        Passkey name
                      </Label>
                      <Input
                        id={`pk-rename-${p.id}`}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="sm:max-w-xs"
                        placeholder="Name"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !renameValue.trim()}
                          onClick={() => void saveRename(p.id)}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setRenameId(null)
                            setRenameValue("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium text-primary">
                        {title}
                      </p>
                      {created ? (
                        <p className="text-xs text-tertiary [font-variant-numeric:tabular-nums]">
                          Added {created}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                {!editing ? (
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setRenameId(p.id)
                        setRenameValue(p.name ?? "")
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void removePasskey(p.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={addPasskey} className="flex flex-col gap-2">
        <Label htmlFor="newPasskeyName">Add a passkey</Label>
        <Input
          id="newPasskeyName"
          value={pkName}
          onChange={(e) => setPkName(e.target.value)}
          placeholder="Label (optional)"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !supportsPk}
          className="mt-1 w-fit"
        >
          {busy ? "Registering…" : "Register new passkey"}
        </Button>
      </form>
    </SettingsSection>
  )
}

export function SessionsSection({
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
    <section className="space-y-2">
      <div className="flex w-full flex-wrap items-start justify-between gap-2 gap-y-1">
        <h2 className="text-sm font-semibold text-primary">Active sessions</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={revokeOthers}
        >
          Sign out other devices
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {!sessions ? <p className="text-xs text-tertiary">loading…</p> : null}
      {sessions && sessions.length === 0 ? (
        <p className="text-xs text-tertiary">No sessions found.</p>
      ) : null}
      {sessions && sessions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => {
            const isCurrent = s.id === currentSessionId
            const deviceKind = sessionDeviceKindFromUserAgent(s.userAgent)
            const uaLabel = s.userAgent?.trim()
              ? truncate(s.userAgent, 56)
              : "Unknown device"
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-base-0 px-3 py-2.5 transition-colors hover:bg-base-2/40 sm:px-3.5 sm:py-3 dark:bg-base-2"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="pt-0.5" aria-hidden>
                    <SessionDeviceIcon kind={deviceKind} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                        {uaLabel}
                      </span>
                      {isCurrent ? (
                        <Badge
                          variant="neutral"
                          className="ml-auto shrink-0 text-[10px] font-medium uppercase"
                        >
                          this device
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-tertiary [font-variant-numeric:tabular-nums]">
                      {s.ipAddress ? <span>{s.ipAddress}</span> : null}
                      {s.ipAddress && s.createdAt ? (
                        <span aria-hidden> · </span>
                      ) : null}
                      {s.createdAt ? (
                        <span>
                          Signed in{" "}
                          {new Date(s.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                {!isCurrent && s.token ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (s.token) void revoke(s.token)
                    }}
                    className="shrink-0"
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
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

export function PrivacySection() {
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
    <SettingsSection className="gap-3">
      <SettingsSectionTitle>Privacy</SettingsSectionTitle>
      <div className="flex flex-wrap gap-1">
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
          users={blocksQuery.isPending ? null : blocksQuery.data}
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
          users={mutesQuery.isPending ? null : mutesQuery.data}
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
    </SettingsSection>
  )
}

export function DangerZone({ onDeleted }: { onDeleted: () => void }) {
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
    <SettingsSection className="gap-3">
      <SettingsSectionTitle className="text-destructive">
        Danger zone
      </SettingsSectionTitle>
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
    </SettingsSection>
  )
}

export function ConnectionsSection({
  oauthConnected,
  oauthConnectError,
}: {
  oauthConnected?: string | null
  oauthConnectError?: string | null
}) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<"refresh" | "disconnect" | "toggle" | null>(
    null
  )
  const [status, setStatus] = useState<string | null>(null)

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
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-primary">Connections</h2>
      <p className="text-xs text-tertiary">
        Link external accounts to enrich your profile. We never post on your
        behalf.
      </p>

      {oauthConnected === "github" ? (
        <div className="rounded-2xl border border-neutral bg-base-0 px-3 py-2.5 text-xs text-secondary sm:px-3.5 sm:py-3 dark:bg-base-2">
          GitHub connected.
        </div>
      ) : null}
      {oauthConnectError != null && oauthConnectError !== "" ? (
        <div className="rounded-2xl border border-danger/40 bg-danger-subtle px-3 py-2.5 text-xs text-danger sm:px-3.5 sm:py-3">
          GitHub connection failed: {oauthConnectError}
        </div>
      ) : null}

      <div className="rounded-2xl bg-base-0 p-3 sm:p-3.5 dark:bg-base-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="text-sm font-semibold text-primary">GitHub</div>
            {isPending ? (
              <PageLoading className="py-6" label="Loading…" />
            ) : null}
            {state && state.configured === false ? (
              <p className="text-xs text-tertiary">
                The server isn&apos;t configured for GitHub connections yet.
              </p>
            ) : null}
            {state?.connected === false && state.configured ? (
              <p className="text-xs text-tertiary">
                Show your contributions graph and pinned repos on your profile.
              </p>
            ) : null}
            {state?.connected === true ? (
              <div className="space-y-1 text-xs text-tertiary">
                <div>
                  Connected as{" "}
                  <a
                    href={`https://github.com/${state.login}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    @{state.login}
                  </a>
                </div>
                {state.refreshedAt ? (
                  <div className="[font-variant-numeric:tabular-nums]">
                    Last synced{" "}
                    {new Date(state.refreshedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                ) : null}
                {state.needsReconnect ? (
                  <div className="text-danger">
                    Token revoked — reconnect to resume.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {state?.connected === true ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  iconLeft={<ArrowPathIcon aria-hidden />}
                  onClick={refresh}
                ></Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
              </>
            ) : state?.configured ? (
              <Button
                size="sm"
                nativeButton={false}
                render={<a href={api.connectorsGithubStartUrl()} />}
              >
                Connect
              </Button>
            ) : null}
          </div>
        </div>
        {state?.connected === true ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-primary">
            <Switch
              checked={state.showOnProfile}
              onCheckedChange={(checked) => toggleVisibility(checked)}
              disabled={busy !== null}
            />
            Show on my profile
          </label>
        ) : null}
        {status ? <p className="mt-2 text-xs text-tertiary">{status}</p> : null}
      </div>
    </section>
  )
}

export function ExperimentsSection() {
  const { me, setMe } = useMe()
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()

  if (!me) return null

  const forYouEnabled = me.experiments.forYouFeed

  async function toggleForYou(checked: boolean) {
    if (!me) return
    setBusy(true)
    try {
      const { experiments } = await api.updateExperiments({
        forYouFeed: checked,
      })
      setMe((prev) => (prev ? { ...prev, experiments } : prev))
      queryClient.removeQueries({ queryKey: qk.feed("forYou") })
      queryClient.removeQueries({ queryKey: qk.feed("network") })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update experiment"
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection>
      <SettingsSectionTitle>Experiments</SettingsSectionTitle>
      <SettingsSectionDescription>
        Try new features before they roll out to everyone. You can turn them off
        at any time.
      </SettingsSectionDescription>
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-start gap-3">
          <Switch
            checked={forYouEnabled}
            onCheckedChange={toggleForYou}
            disabled={busy}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-primary">
              For You feed
            </span>
            <span className="text-xs text-secondary">
              Replace the Network tab with a personalized For You feed on your
              home timeline.
            </span>
          </div>
        </label>
      </div>
    </SettingsSection>
  )
}

export function DevToolsSection() {
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
    <SettingsSection className="gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-primary">Seed Data</h3>
        <p className="text-xs text-tertiary">
          Create fake users, posts with images, replies, reposts, and quote
          tweets for testing. Also creates a few posts for your account.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSeed}
          loading={loading}
        >
          Seed posts
        </Button>
        {status ? <p className="text-xs text-secondary">{status}</p> : null}
      </div>
    </SettingsSection>
  )
}
