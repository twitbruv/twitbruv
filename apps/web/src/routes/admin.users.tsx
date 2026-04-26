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
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  BookmarkIcon,
  CaretDownIcon,
  ChatCircleIcon,
  EyeIcon,
  FlagIcon,
  HeartIcon,
  RepeatIcon,
  UsersIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"
import { api } from "../lib/api"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import { useMe } from "../lib/me"
import { Avatar } from "../components/avatar"
import { PageError, PageLoading } from "../components/page-surface"
import { VerifiedBadge } from "../components/verified-badge"
import type { Icon } from "@phosphor-icons/react"
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
  user: "25%",
  email: "20%",
  role: "10%",
  status: "17%",
  actions: "28%",
}

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
                <CaretDownIcon className="size-3" />
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
      {error && <PageError message={error} />}
      {loading && users.length === 0 && (
        <PageLoading className="py-8" label="Loading…" />
      )}
      {users.length > 0 && (
        <div
          ref={setScrollRoot}
          className="flex-1 overflow-auto overscroll-contain"
        >
          <Table className="table-fixed">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-action-handle" className="text-xs text-muted-foreground">
                New handle
              </Label>
              <Input
                id="admin-action-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="newhandle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-action-reason" className="text-xs text-muted-foreground">
              Reason (optional)
            </Label>
            <Input
              id="admin-action-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason"
            />
          </div>
          {config.showDuration && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-action-hours" className="text-xs text-muted-foreground">
                Duration in hours (blank = permanent)
              </Label>
              <Input
                id="admin-action-hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 24"
                inputMode="numeric"
              />
            </div>
          )}
          {state.kind === "delete" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-action-confirm" className="text-xs text-muted-foreground">
                Type <code className="rounded bg-muted px-1">{deleteConfirmText}</code> to confirm
              </Label>
              <Input
                id="admin-action-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={deleteConfirmText}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
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

// Tailwind palette tokens for each section. Listed verbatim so the JIT picks them up — building
// these strings dynamically would skip the safelist and the colours would silently disappear.
const ACCENT = {
  sky: {
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/30",
    bar: "bg-sky-500",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
    ring: "ring-violet-500/30",
    bar: "bg-violet-500",
  },
  rose: {
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    ring: "ring-rose-500/30",
    bar: "bg-rose-500",
  },
  emerald: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    bar: "bg-emerald-500",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    bar: "bg-amber-500",
  },
  fuchsia: {
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    ring: "ring-fuchsia-500/30",
    bar: "bg-fuchsia-500",
  },
} as const
type AccentKey = keyof typeof ACCENT

const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const fullFormatter = new Intl.NumberFormat("en")

function formatStat(value: number | null | undefined, compact: boolean): string {
  if (value === null || value === undefined) return "…"
  return compact && value >= 10_000
    ? compactFormatter.format(value)
    : fullFormatter.format(value)
}

function HeroCard({
  icon: Icon,
  label,
  value,
  accent,
  delta,
  deltaLabel,
}: {
  icon: Icon
  label: string
  value: number | null | undefined
  accent: AccentKey
  delta?: number | null
  deltaLabel?: string
}) {
  const a = ACCENT[accent]
  const isLoading = value === null || value === undefined
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className={`pointer-events-none absolute -right-6 -top-6 size-20 rounded-full opacity-60 blur-2xl ${a.bg}`} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        <span className={`flex size-7 items-center justify-center rounded-md ring-1 ${a.bg} ${a.text} ${a.ring}`}>
          <Icon className="size-4" weight="bold" />
        </span>
      </div>
      <p
        className={`relative mt-3 text-3xl font-semibold tabular-nums tracking-tight ${
          isLoading ? "text-muted-foreground" : ""
        }`}
        title={isLoading ? undefined : fullFormatter.format(value)}
      >
        {formatStat(value, true)}
      </p>
      {delta !== undefined && delta !== null && (
        <p className="relative mt-1 text-[11px] text-muted-foreground">
          <span className={`font-medium ${a.text}`}>
            +{fullFormatter.format(delta)}
          </span>{" "}
          {deltaLabel}
        </p>
      )}
    </div>
  )
}

type Tone = "default" | "destructive" | "warning" | "positive"

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number | null | undefined
  tone?: Tone
}) {
  const isLoading = value === null || value === undefined
  const toneCls =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-500"
        : tone === "positive"
          ? "text-emerald-600 dark:text-emerald-500"
          : ""
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5">
      <span className="truncate text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          isLoading ? "text-muted-foreground" : toneCls
        }`}
        title={isLoading ? undefined : fullFormatter.format(value)}
      >
        {formatStat(value, true)}
      </span>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string
  icon: Icon
  accent: AccentKey
  children: React.ReactNode
}) {
  const a = ACCENT[accent]
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`size-1 rounded-full ${a.bar}`} />
        <Icon className={`size-3.5 ${a.text}`} weight="bold" />
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-foreground uppercase">
          {title}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{children}</div>
    </div>
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

  if (error) {
    return (
      <div className="shrink-0 border-b border-border p-4">
        <p className="text-xs text-destructive">stats: {error}</p>
      </div>
    )
  }

  return (
    <div className="shrink-0 space-y-4 border-b border-border bg-gradient-to-b from-muted/30 via-background to-background p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        <HeroCard
          icon={UsersIcon}
          label="Active users"
          value={stats?.users.active}
          accent="sky"
          delta={stats?.users.newToday}
          deltaLabel="new today"
        />
        <HeroCard
          icon={ChatCircleIcon}
          label="Posts"
          value={stats?.posts.total}
          accent="violet"
          delta={stats?.posts.newToday}
          deltaLabel="new today"
        />
        <HeroCard
          icon={HeartIcon}
          label="Likes"
          value={stats?.engagement.likes}
          accent="rose"
          delta={stats?.engagement.likesToday}
          deltaLabel="new today"
        />
        <HeroCard
          icon={RepeatIcon}
          label="Reposts"
          value={stats?.engagement.reposts}
          accent="emerald"
        />
        <HeroCard
          icon={BookmarkIcon}
          label="Bookmarks"
          value={stats?.engagement.bookmarks}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="Users" icon={UsersIcon} accent="sky">
          <MiniStat label="Total" value={stats?.users.total} />
          <MiniStat label="Active" value={stats?.users.active} />
          <MiniStat label="Verified" value={stats?.users.verified} />
          <MiniStat label="Admins" value={stats?.users.admins} />
          <MiniStat label="Banned" value={stats?.users.banned} tone="destructive" />
          <MiniStat label="Shadow" value={stats?.users.shadowBanned} tone="warning" />
          <MiniStat label="Deleted" value={stats?.users.deleted} tone="destructive" />
          <MiniStat label="New 24h" value={stats?.users.newToday} tone="positive" />
          <MiniStat label="New 7d" value={stats?.users.newThisWeek} tone="positive" />
        </Section>

        <Section title="Posts" icon={ChatCircleIcon} accent="violet">
          <MiniStat label="Total" value={stats?.posts.total} />
          <MiniStat label="Original" value={stats?.posts.original} />
          <MiniStat label="Replies" value={stats?.posts.replies} />
          <MiniStat label="Reposts" value={stats?.posts.reposts} />
          <MiniStat label="Quotes" value={stats?.posts.quotes} />
          <MiniStat label="Edited" value={stats?.posts.edited} />
          <MiniStat label="Sensitive" value={stats?.posts.sensitive} tone="warning" />
          <MiniStat label="Deleted" value={stats?.posts.deleted} tone="destructive" />
          <MiniStat label="New 24h" value={stats?.posts.newToday} tone="positive" />
        </Section>

        <Section title="Engagement" icon={HeartIcon} accent="rose">
          <MiniStat label="Likes" value={stats?.engagement.likes} />
          <MiniStat label="Likes 24h" value={stats?.engagement.likesToday} tone="positive" />
          <MiniStat label="Bookmarks" value={stats?.engagement.bookmarks} />
          <MiniStat label="Reposts" value={stats?.engagement.reposts} />
          <MiniStat label="Quotes" value={stats?.engagement.quotes} />
          <MiniStat label="Replies" value={stats?.engagement.replies} />
        </Section>

        <Section title="Reach" icon={EyeIcon} accent="fuchsia">
          <MiniStat label="Impressions" value={stats?.posts.totalImpressions} />
          <MiniStat label="Conversations" value={stats?.messaging.conversations} />
          <MiniStat label="Messages" value={stats?.messaging.messages} />
        </Section>

        <Section title="Social graph" icon={UsersThreeIcon} accent="emerald">
          <MiniStat label="Follows" value={stats?.social.follows} />
          <MiniStat label="Follows 24h" value={stats?.social.followsToday} tone="positive" />
          <MiniStat label="Blocks" value={stats?.social.blocks} tone="destructive" />
          <MiniStat label="Mutes" value={stats?.social.mutes} tone="warning" />
        </Section>

        <Section title="Reports" icon={FlagIcon} accent="amber">
          <MiniStat label="Total" value={stats?.reports.total} />
          <MiniStat label="Open" value={stats?.reports.open} tone="warning" />
          <MiniStat label="Triaged" value={stats?.reports.triaged} />
          <MiniStat label="Actioned" value={stats?.reports.actioned} tone="positive" />
          <MiniStat label="Dismissed" value={stats?.reports.dismissed} />
        </Section>
      </div>
    </div>
  )
}
