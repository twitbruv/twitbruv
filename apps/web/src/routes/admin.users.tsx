import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { IconChevronDown } from "@tabler/icons-react"
import { api } from "../lib/api"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import { useMe } from "../lib/me"
import { Avatar } from "../components/avatar"
import { VerifiedBadge } from "../components/verified-badge"
import type { ColumnDef } from "@tanstack/react-table"
import type { AdminStats, AdminUser } from "../lib/api"

export const Route = createFileRoute("/admin/users")({ component: AdminUsers })

type Role = "user" | "admin" | "owner"
const ROLES: Array<Role> = ["user", "admin", "owner"]

type ActionDialogState =
  | { kind: "ban"; user: AdminUser }
  | { kind: "shadow"; user: AdminUser }
  | { kind: "verify"; user: AdminUser }
  | { kind: "handle"; user: AdminUser }
  | { kind: "delete"; user: AdminUser }
  | null

const COLUMN_WIDTHS: Record<string, string> = {
  user: "280px",
  email: "240px",
  role: "120px",
  status: "200px",
  actions: "340px",
}
const TABLE_MIN_WIDTH = "1180px"

function AdminUsers() {
  const { me } = useMe()
  const [q, setQ] = useState("")
  const [users, setUsers] = useState<Array<AdminUser>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<ActionDialogState>(null)
  // Bumped on every fresh load so in-flight loadMore results from a prior
  // search/refresh are discarded instead of getting appended to the new list.
  const generationRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (search: string) => {
    const gen = ++generationRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.adminUsers(search || undefined)
      if (generationRef.current !== gen) return
      setUsers(res.users)
      setCursor(res.nextCursor)
    } catch (e) {
      if (generationRef.current !== gen) return
      setError(e instanceof Error ? e.message : "failed")
    } finally {
      if (generationRef.current === gen) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q, load])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    const gen = generationRef.current
    setLoadingMore(true)
    try {
      const res = await api.adminUsers(q || undefined, cursor)
      if (generationRef.current !== gen) return
      setUsers((prev) => [...prev, ...res.users])
      setCursor(res.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, q])


  const act = useCallback(
    async (userId: string, op: () => Promise<unknown>) => {
      setBusyId(userId)
      try {
        await op()
        await load(q)
      } finally {
        setBusyId(null)
      }
    },
    [load, q]
  )

  const columns = useMemo<Array<ColumnDef<AdminUser>>>(
    () => [
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const u = row.original
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                initial={(u.displayName || u.handle || u.email)
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
                    className="flex items-center gap-1 text-sm font-semibold hover:underline"
                  >
                    {u.displayName ?? u.handle}
                    {u.isVerified && <VerifiedBadge size={14} role={u.role} />}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {u.displayName ?? u.email}
                    {u.isVerified && <VerifiedBadge size={14} role={u.role} />}
                  </span>
                )}
                {u.handle && (
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.handle}
                  </p>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="block truncate text-xs text-muted-foreground">
            {row.original.email}
          </span>
        ),
      },
      {
        id: "role",
        header: "Role",
        cell: ({ row }) => {
          const u = row.original
          const canEdit = me?.role === "owner" && u.id !== me.id
          if (!canEdit) {
            return (
              <span className="text-xs tracking-wider text-muted-foreground uppercase">
                {u.role}
              </span>
            )
          }
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === u.id}
                    className="-ml-2 h-7 gap-1 text-xs tracking-wider uppercase"
                  />
                }
              >
                {u.role}
                <IconChevronDown className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Set role</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ROLES.map((r) => (
                    <DropdownMenuItem
                      key={r}
                      disabled={r === u.role}
                      onClick={() =>
                        r !== u.role &&
                        act(u.id, () => api.adminSetRole(u.id, r))
                      }
                    >
                      <span className="tracking-wider uppercase">{r}</span>
                      {r === u.role && (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          current
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const u = row.original
          const status = u.banned
            ? `banned${u.banExpires ? ` until ${new Date(u.banExpires).toLocaleString()}` : ""}`
            : u.shadowBannedAt
              ? "shadowbanned"
              : u.deletedAt
                ? "deleted"
                : "active"
          return (
            <div className="flex flex-col gap-0.5">
              <span
                className={`text-xs ${
                  status === "active"
                    ? "text-muted-foreground"
                    : "text-destructive"
                }`}
              >
                {status}
              </span>
              {u.banReason && (
                <span className="text-[10px] text-destructive">
                  reason: {u.banReason}
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const u = row.original
          return (
            <div className="flex flex-wrap justify-end gap-1">
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
                  onClick={() => setDialog({ kind: "ban", user: u })}
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
                  onClick={() => setDialog({ kind: "shadow", user: u })}
                >
                  Shadow
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === u.id}
                onClick={() => setDialog({ kind: "verify", user: u })}
              >
                {u.isVerified ? "Unverify" : "Verify"}
              </Button>
              {me?.role === "owner" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === u.id}
                  onClick={() => setDialog({ kind: "handle", user: u })}
                >
                  Handle
                </Button>
              )}
              {me?.role === "owner" && !u.deletedAt && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === u.id || u.id === me.id}
                  onClick={() => setDialog({ kind: "delete", user: u })}
                >
                  Delete
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [act, busyId, me]
  )

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const rows = table.getRowModel().rows
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 64,
    getScrollElement: () => scrollRoot,
    overscan: 8,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - virtualRows[virtualRows.length - 1].end
      : 0

  useInfiniteScrollSentinel(sentinelRef, !!cursor, loadingMore, loadMore, {
    root: scrollRoot,
  })

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <StatCards />
      <div className="shrink-0 border-b border-border p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search by handle or email…"
        />
      </div>
      {error && <p className="p-4 text-sm text-destructive">{error}</p>}
      {loading && users.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">loading…</p>
      )}
      {users.length > 0 && (
        <div
          ref={setScrollRoot}
          className="flex-1 overflow-auto overscroll-contain"
        >
          <Table
            className="table-fixed"
            style={{ minWidth: TABLE_MIN_WIDTH }}
          >
            <colgroup>
              {table.getVisibleLeafColumns().map((col) => (
                <col key={col.id} style={{ width: COLUMN_WIDTHS[col.id] }} />
              ))}
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={columns.length} style={{ height: paddingTop }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index]
                return (
                  <TableRow
                    key={row.id}
                    data-index={virtualRow.index}
                    ref={(node: HTMLTableRowElement | null) =>
                      rowVirtualizer.measureElement(node)
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={columns.length}
                    style={{ height: paddingBottom }}
                  />
                </tr>
              )}
            </TableBody>
          </Table>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {cursor && (
            <div className="flex justify-center py-3 text-xs text-muted-foreground">
              {loadingMore ? "loading…" : ""}
            </div>
          )}
        </div>
      )}
      <ActionDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSubmit={async (run) => {
          if (!dialog) return
          const id = dialog.user.id
          setBusyId(id)
          try {
            await run()
            setDialog(null)
            await load(q)
          } finally {
            setBusyId(null)
          }
        }}
      />
    </main>
  )
}

function ActionDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: ActionDialogState
  onClose: () => void
  onSubmit: (run: () => Promise<unknown>) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [hours, setHours] = useState("")
  const [handle, setHandle] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (state) {
      setReason("")
      setHours("")
      setHandle(state.kind === "handle" ? (state.user.handle ?? "") : "")
      setConfirm("")
      setSubmitError(null)
      setBusy(false)
    }
  }, [state])

  if (!state) {
    return (
      <Dialog open={false} onOpenChange={(next) => !next && onClose()}>
        <DialogContent />
      </Dialog>
    )
  }

  const u = state.user
  const subject = `@${u.handle ?? u.email}`
  const deleteConfirmText = u.handle ?? u.email

  const config = {
    ban: {
      title: `Ban ${subject}`,
      description:
        "Bans block all activity. Leave duration empty for a permanent ban.",
      submitLabel: "Ban user",
      submitVariant: "destructive" as const,
      showDuration: true,
      run: () => {
        const durationHours =
          hours.trim() && Number.isFinite(Number(hours))
            ? Number(hours)
            : undefined
        return api.adminBan(u.id, {
          reason: reason.trim() || undefined,
          durationHours,
        })
      },
    },
    shadow: {
      title: `Shadowban ${subject}`,
      description:
        "Shadowbans hide the user's posts from others without notifying them.",
      submitLabel: "Shadowban",
      submitVariant: "default" as const,
      showDuration: false,
      run: () =>
        api.adminShadowban(u.id, { reason: reason.trim() || undefined }),
    },
    verify: {
      title: u.isVerified
        ? `Revoke verified badge from ${subject}`
        : `Grant verified badge to ${subject}`,
      description: u.isVerified
        ? "The verified badge will be removed."
        : "The user will be marked as verified.",
      submitLabel: u.isVerified ? "Revoke" : "Grant",
      submitVariant: "default" as const,
      showDuration: false,
      run: () =>
        u.isVerified
          ? api.adminUnverify(u.id, reason.trim() || undefined)
          : api.adminVerify(u.id, reason.trim() || undefined),
    },
    handle: {
      title: `Change handle for ${subject}`,
      description:
        "3–20 chars, letters/numbers/underscore. The previous handle is freed for reuse.",
      submitLabel: "Save handle",
      submitVariant: "default" as const,
      showDuration: false,
      run: () =>
        api.adminSetHandle(u.id, {
          handle: handle.trim(),
          reason: reason.trim() || undefined,
        }),
    },
    delete: {
      title: `Delete account ${subject}`,
      description:
        "Soft-deletes the account: removes them from feeds, profiles, and search, and signs them out everywhere. Reversible from the database.",
      submitLabel: "Delete account",
      submitVariant: "destructive" as const,
      showDuration: false,
      run: () =>
        api.adminDeleteUser(u.id, { reason: reason.trim() || undefined }),
    },
  }[state.kind]

  async function submit() {
    setBusy(true)
    setSubmitError(null)
    try {
      await onSubmit(config.run)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {state.kind === "handle" && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">New handle</span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="newhandle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Reason (optional)</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason"
              autoFocus={state.kind !== "handle"}
            />
          </label>
          {config.showDuration && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Duration in hours (blank = permanent)
              </span>
              <Input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 24"
                inputMode="numeric"
              />
            </label>
          )}
          {state.kind === "delete" && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Type <code className="rounded bg-muted px-1">{deleteConfirmText}</code> to confirm
              </span>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={deleteConfirmText}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
          )}
          {submitError && (
            <p className="text-xs text-destructive">{submitError}</p>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={config.submitVariant}
            onClick={submit}
            disabled={busy || (state.kind === "delete" && confirm !== deleteConfirmText)}
          >
            {busy ? "Working…" : config.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatCards() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .adminStats()
      .then((res) => {
        if (!cancelled) setStats(res)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cards: Array<{ label: string; value: number | null; tone?: "destructive" | "warning" }> = [
    { label: "Total users", value: stats?.users.total ?? null },
    { label: "Active", value: stats?.users.active ?? null },
    { label: "Banned", value: stats?.users.banned ?? null, tone: "destructive" },
    { label: "Shadowbanned", value: stats?.users.shadowBanned ?? null, tone: "warning" },
    { label: "Deleted", value: stats?.users.deleted ?? null, tone: "destructive" },
    { label: "Verified", value: stats?.users.verified ?? null },
    { label: "Admins", value: stats?.users.admins ?? null },
    { label: "New (24h)", value: stats?.users.newToday ?? null },
    { label: "New (7d)", value: stats?.users.newThisWeek ?? null },
    { label: "Open reports", value: stats?.reports.open ?? null, tone: "warning" },
  ]

  return (
    <div className="shrink-0 border-b border-border p-4">
      {error ? (
        <p className="text-xs text-destructive">stats: {error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-md border border-border bg-card p-3"
            >
              <p className="truncate text-[10px] tracking-wider text-muted-foreground uppercase">
                {card.label}
              </p>
              <p
                className={`mt-1 text-xl font-semibold tabular-nums ${
                  card.tone === "destructive"
                    ? "text-destructive"
                    : card.tone === "warning"
                      ? "text-amber-600 dark:text-amber-500"
                      : ""
                }`}
              >
                {card.value === null ? (
                  <span className="text-muted-foreground">…</span>
                ) : (
                  card.value.toLocaleString()
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
