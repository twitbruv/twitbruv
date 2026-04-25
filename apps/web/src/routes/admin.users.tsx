import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {  api } from "../lib/api"
import { useMe } from "../lib/me"
import { Avatar } from "../components/avatar"
import { VerifiedBadge } from "../components/verified-badge"
import type {AdminUser} from "../lib/api";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers })

function AdminUsers() {
  const { me } = useMe()
  const [q, setQ] = useState("")
  const [users, setUsers] = useState<Array<AdminUser>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (search: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.adminUsers(search || undefined)
      setUsers(res.users)
      setCursor(res.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q, load])

  async function loadMore() {
    if (!cursor) return
    const res = await api.adminUsers(q || undefined, cursor)
    setUsers((prev) => [...prev, ...res.users])
    setCursor(res.nextCursor)
  }

  async function act(userId: string, op: () => Promise<unknown>) {
    setBusyId(userId)
    try {
      await op()
      await load(q)
    } finally {
      setBusyId(null)
    }
  }

  function ban(u: AdminUser) {
    const reason = window.prompt(`Ban @${u.handle ?? u.email}? Reason (optional):`, "")
    if (reason === null) return
    const hours = window.prompt("Duration in hours? Leave blank for permanent:", "")
    const durationHours = hours && hours.trim() ? Number(hours) : undefined
    return act(u.id, () =>
      api.adminBan(u.id, {
        reason: reason || undefined,
        durationHours: Number.isFinite(durationHours) ? durationHours : undefined,
      }),
    )
  }

  function shadow(u: AdminUser) {
    const reason = window.prompt(`Shadowban @${u.handle ?? u.email}? Private reason:`, "")
    if (reason === null) return
    return act(u.id, () => api.adminShadowban(u.id, { reason: reason || undefined }))
  }

  function setRole(u: AdminUser) {
    const role = window.prompt(
      `Set role for @${u.handle ?? u.email}. Allowed: user, admin, owner`,
      u.role,
    )
    if (!role || !["user", "admin", "owner"].includes(role)) return
    return act(u.id, () => api.adminSetRole(u.id, role as "user" | "admin" | "owner"))
  }

  function toggleVerify(u: AdminUser) {
    const verb = u.isVerified ? "Revoke verified badge from" : "Grant verified badge to"
    const reason = window.prompt(`${verb} @${u.handle ?? u.email}? Reason (optional):`, "")
    if (reason === null) return
    return act(u.id, () =>
      u.isVerified
        ? api.adminUnverify(u.id, reason || undefined)
        : api.adminVerify(u.id, reason || undefined),
    )
  }

  return (
    <main>
      <div className="border-b border-border p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search by handle or email…"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {error && <p className="p-4 text-sm text-destructive">{error}</p>}
      {loading && users.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">loading…</p>
      )}
      <ul>
        {users.map((u) => {
          const status = u.banned
            ? `banned${u.banExpires ? ` until ${new Date(u.banExpires).toLocaleString()}` : ""}`
            : u.shadowBannedAt
            ? "shadowbanned"
            : u.deletedAt
            ? "deleted"
            : "active"
          return (
            <li
              key={u.id}
              className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <Avatar
                  initial={(u.displayName || u.handle || u.email).slice(0, 1).toUpperCase()}
                  src={u.avatarUrl}
                  className="size-10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {u.handle ? (
                    <Link
                      to="/$handle"
                      params={{ handle: u.handle }}
                      className="flex items-center gap-1 text-sm font-semibold hover:underline"
                    >
                      {u.displayName ?? u.handle}
                      {u.isVerified && <VerifiedBadge size={14} />}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      {u.displayName ?? u.email}
                      {u.isVerified && <VerifiedBadge size={14} />}
                    </span>
                  )}
                  {u.handle && (
                    <span className="text-xs text-muted-foreground">@{u.handle}</span>
                  )}
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {u.role}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span
                    className={`text-xs ${
                      status === "active" ? "text-muted-foreground" : "text-destructive"
                    }`}
                  >
                    {status}
                  </span>
                  {u.isVerified && (
                    <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      verified
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{u.email}</p>
                {u.banReason && (
                  <p className="mt-1 text-xs text-destructive">reason: {u.banReason}</p>
                )}
                </div>
              </div>
              <div className="flex shrink-0 flex-row flex-wrap items-center gap-1 sm:flex-col sm:items-end">
                <div className="flex flex-wrap gap-1">
                  {u.banned ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === u.id}
                      onClick={() => act(u.id, () => api.adminUnban(u.id))}
                    >
                      Unban
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === u.id || u.id === me?.id}
                      onClick={() => ban(u)}
                    >
                      Ban
                    </Button>
                  )}
                  {u.shadowBannedAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === u.id}
                      onClick={() => act(u.id, () => api.adminUnshadowban(u.id))}
                    >
                      Unshadow
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === u.id || u.id === me?.id}
                      onClick={() => shadow(u)}
                    >
                      Shadow
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === u.id}
                    onClick={() => toggleVerify(u)}
                  >
                    {u.isVerified ? "Unverify" : "Verify"}
                  </Button>
                </div>
                {me?.role === "owner" && u.id !== me.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === u.id}
                    onClick={() => setRole(u)}
                  >
                    role
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {cursor && (
        <div className="flex justify-center py-3">
          <Button variant="ghost" size="sm" onClick={loadMore}>
            load more
          </Button>
        </div>
      )}
    </main>
  )
}
