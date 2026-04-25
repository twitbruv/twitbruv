import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
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
import { useMe } from "../lib/me"
import { Avatar } from "../components/avatar"
import { VerifiedBadge } from "../components/verified-badge"
import type { ColumnDef } from "@tanstack/react-table"
import type { AdminUser } from "../lib/api"

export const Route = createFileRoute("/admin/users")({ component: AdminUsers })

type Role = "user" | "admin" | "owner"
const ROLES: Array<Role> = ["user", "admin", "owner"]

type ActionDialogState =
  | { kind: "ban"; user: AdminUser }
  | { kind: "shadow"; user: AdminUser }
  | { kind: "verify"; user: AdminUser }
  | null

function AdminUsers() {
  const { me } = useMe()
  const [q, setQ] = useState("")
  const [users, setUsers] = useState<Array<AdminUser>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<ActionDialogState>(null)

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
                    {u.isVerified && (
                      <VerifiedBadge size={14} role={u.role} />
                    )}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {u.displayName ?? u.email}
                    {u.isVerified && (
                      <VerifiedBadge size={14} role={u.role} />
                    )}
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
          <span className="truncate text-xs text-muted-foreground">
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

  return (
    <main>
      <div className="border-b border-border p-4">
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
        <Table>
          <TableHeader>
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {cursor && (
        <div className="flex justify-center py-3">
          <Button variant="ghost" size="sm" onClick={loadMore}>
            load more
          </Button>
        </div>
      )}
      <ActionDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSubmit={async (run) => {
          if (!dialog) return
          const id = dialog.user.id
          setDialog(null)
          await act(id, run)
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
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (state) {
      setReason("")
      setHours("")
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
  }[state.kind]

  async function submit() {
    setBusy(true)
    try {
      await onSubmit(config.run)
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
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Reason (optional)</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason"
              autoFocus
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
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={config.submitVariant}
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Working…" : config.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
