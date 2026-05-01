import { Link } from "@tanstack/react-router"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
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
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  ChevronDownIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/solid"
import { Avatar } from "@workspace/ui/components/avatar"
import { api } from "../../lib/api"
import { qk } from "../../lib/query-keys"
import { useInfiniteScrollSentinel } from "../../lib/use-infinite-scroll-sentinel"
import { useMe } from "../../lib/me"
import { PageError, PageLoading } from "../page-surface"
import { PageFrame } from "../page-frame"
import { VerifiedBadge } from "../verified-badge"
import type { ColumnDef } from "@tanstack/react-table"
import type { AdminUser } from "../../lib/api"

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
  user: "20%",
  email: "17%",
  posts: "6%",
  followers: "6%",
  following: "6%",
  reports: "6%",
  joined: "9%",
  role: "8%",
  status: "14%",
  actions: "8%",
}

function compactNum(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n < 1000) return String(n)
  if (n < 1_000_000)
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

export default function AdminUsers() {
  const { me } = useMe()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const filters = useMemo(
    () => ({ q: debouncedQ.trim() || undefined }),
    [debouncedQ]
  )

  const {
    data,
    error,
    isPending,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: qk.admin.users(filters),
    queryFn: ({ pageParam }) => api.adminUsers(filters.q, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const users = useMemo(() => data?.pages.flatMap((p) => p.users) ?? [], [data])

  const loadError = error instanceof Error ? error.message : "failed to load"

  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<ActionDialogState>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  const act = useCallback(
    async (userId: string, op: () => Promise<unknown>) => {
      setBusyId(userId)
      try {
        await op()
        await qc.invalidateQueries({ queryKey: qk.admin.users(filters) })
        await qc.invalidateQueries({ queryKey: qk.admin.user(userId) })
      } finally {
        setBusyId(null)
      }
    },
    [filters, qc]
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    {u.displayName ?? u.handle}
                    {u.isVerified && (
                      <VerifiedBadge className="size-3.5" role={u.role} />
                    )}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {u.displayName ?? u.email}
                    {u.isVerified && (
                      <VerifiedBadge className="size-3.5" role={u.role} />
                    )}
                  </span>
                )}
                {u.handle && (
                  <p className="truncate text-xs text-tertiary">@{u.handle}</p>
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
          <span className="block truncate text-xs text-tertiary">
            {row.original.email}
          </span>
        ),
      },
      {
        id: "posts",
        header: "Posts",
        cell: ({ row }) => (
          <span className="text-xs text-tertiary tabular-nums">
            {compactNum(row.original.postsCount)}
          </span>
        ),
      },
      {
        id: "followers",
        header: "Followers",
        cell: ({ row }) => (
          <span className="text-xs text-tertiary tabular-nums">
            {compactNum(row.original.followersCount)}
          </span>
        ),
      },
      {
        id: "following",
        header: "Following",
        cell: ({ row }) => (
          <span className="text-xs text-tertiary tabular-nums">
            {compactNum(row.original.followingCount)}
          </span>
        ),
      },
      {
        id: "reports",
        header: "Open R.",
        cell: ({ row }) => (
          <span
            className={`text-xs tabular-nums ${
              row.original.openReportsCount > 0
                ? "font-medium text-amber-600 dark:text-amber-500"
                : "text-tertiary"
            }`}
          >
            {compactNum(row.original.openReportsCount)}
          </span>
        ),
      },
      {
        id: "joined",
        header: "Joined",
        cell: ({ row }) => (
          <time
            dateTime={row.original.createdAt}
            title={new Date(row.original.createdAt).toLocaleString()}
            className="text-xs text-tertiary"
          >
            {new Date(row.original.createdAt).toLocaleDateString()}
          </time>
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
              <span className="text-xs tracking-wider text-tertiary uppercase">
                {u.role}
              </span>
            )
          }
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  render={
                    <Button
                      size="sm"
                      variant="transparent"
                      disabled={busyId === u.id}
                      className="-ml-2 h-7 gap-1 text-xs tracking-wider uppercase"
                    />
                  }
                >
                  {u.role}
                  <ChevronDownIcon className="size-3" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start">
                  <DropdownMenu.Group>
                    <DropdownMenu.Label>Set role</DropdownMenu.Label>
                    <DropdownMenu.Separator />
                    {ROLES.map((r) => (
                      <DropdownMenu.Item
                        key={r}
                        disabled={r === u.role}
                        onClick={() =>
                          r !== u.role &&
                          act(u.id, () => api.adminSetRole(u.id, r))
                        }
                      >
                        <span className="tracking-wider uppercase">{r}</span>
                        {r === u.role && (
                          <span className="ml-auto text-[10px] text-tertiary">
                            current
                          </span>
                        )}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Group>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
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
                  status === "active" ? "text-tertiary" : "text-destructive"
                }`}
              >
                {status}
              </span>
              {u.banReason && (
                <span className="text-destructive text-[10px]">
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
          const isSelf = u.id === me?.id
          const isOwner = me?.role === "owner"
          return (
            <div
              className="flex justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  render={
                    <Button
                      size="sm"
                      variant="transparent"
                      disabled={busyId === u.id}
                      className="size-7 p-0"
                      aria-label="Open user actions"
                    />
                  }
                >
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Group>
                    {u.banned ? (
                      <DropdownMenu.Item
                        onClick={() => act(u.id, () => api.adminUnban(u.id))}
                      >
                        Unban
                      </DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item
                        variant="danger"
                        disabled={isSelf}
                        onClick={() => setDialog({ kind: "ban", user: u })}
                      >
                        Ban…
                      </DropdownMenu.Item>
                    )}
                    {u.shadowBannedAt ? (
                      <DropdownMenu.Item
                        onClick={() =>
                          act(u.id, () => api.adminUnshadowban(u.id))
                        }
                      >
                        Remove shadowban
                      </DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item
                        disabled={isSelf}
                        onClick={() => setDialog({ kind: "shadow", user: u })}
                      >
                        Shadowban…
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                      onClick={() => setDialog({ kind: "verify", user: u })}
                    >
                      {u.isVerified ? "Revoke verified" : "Mark verified"}
                    </DropdownMenu.Item>
                  </DropdownMenu.Group>
                  {isOwner && (
                    <>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Group>
                        <DropdownMenu.Item
                          onClick={() => setDialog({ kind: "handle", user: u })}
                        >
                          Change handle…
                        </DropdownMenu.Item>
                        {!u.deletedAt && (
                          <DropdownMenu.Item
                            variant="danger"
                            disabled={isSelf}
                            onClick={() =>
                              setDialog({ kind: "delete", user: u })
                            }
                          >
                            Delete account…
                          </DropdownMenu.Item>
                        )}
                      </DropdownMenu.Group>
                    </>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
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

  useInfiniteScrollSentinel(
    sentinelRef,
    Boolean(hasNextPage),
    isFetchingNextPage,
    loadMore,
    {
      root: scrollRoot,
    }
  )

  return (
    <PageFrame width="full" className="flex flex-col">
      <div className="shrink-0 border-b border-neutral p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search by handle or email…"
        />
      </div>
      {loadError && <PageError message={loadError} />}
      {isPending && users.length === 0 && (
        <PageLoading className="py-8" label="Loading…" />
      )}
      {users.length > 0 && (
        <div ref={setScrollRoot} className="flex-1">
          <Table className="table-fixed">
            <colgroup>
              {table.getVisibleLeafColumns().map((col) => (
                <col key={col.id} style={{ width: COLUMN_WIDTHS[col.id] }} />
              ))}
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-base-1">
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
                    data-state={
                      row.original.id === selectedId ? "selected" : undefined
                    }
                    ref={(node: HTMLTableRowElement | null) =>
                      rowVirtualizer.measureElement(node)
                    }
                    onClick={() => setSelectedId(row.original.id)}
                    className="cursor-pointer"
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
          {hasNextPage && (
            <div className="flex justify-center py-3 text-xs text-tertiary">
              {isFetchingNextPage ? "loading…" : ""}
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
            await qc.invalidateQueries({ queryKey: qk.admin.users(filters) })
            await qc.invalidateQueries({ queryKey: qk.admin.user(id) })
          } finally {
            setBusyId(null)
          }
        }}
      />
      <UserDetailSheet
        userId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </PageFrame>
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
      submitVariant: "danger" as const,
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
      submitVariant: "outline" as const,
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
      submitVariant: "outline" as const,
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
      submitVariant: "outline" as const,
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
      submitVariant: "danger" as const,
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
              <Label
                htmlFor="admin-action-handle"
                className="text-xs text-tertiary"
              >
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
            <Label
              htmlFor="admin-action-reason"
              className="text-xs text-tertiary"
            >
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
              <Label
                htmlFor="admin-action-hours"
                className="text-xs text-tertiary"
              >
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
              <Label
                htmlFor="admin-action-confirm"
                className="text-xs text-tertiary"
              >
                Type{" "}
                <code className="rounded bg-base-2 px-1">
                  {deleteConfirmText}
                </code>{" "}
                to confirm
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
            <p className="text-destructive text-xs">{submitError}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="transparent"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant={config.submitVariant}
            onClick={submit}
            disabled={
              busy || (state.kind === "delete" && confirm !== deleteConfirmText)
            }
          >
            {busy ? "Working…" : config.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ACTION_LABELS: Record<string, string> = {
  warn: "Warning",
  hide: "Hidden",
  delete: "Deleted",
  shadowban: "Shadowban",
  suspend: "Ban",
  unban: "Unban",
  nsfw_flag: "NSFW flag",
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action
}

function UserDetailSheet({
  userId,
  onClose,
}: {
  userId: string | null
  onClose: () => void
}) {
  const {
    data: detail,
    error,
    isPending: loading,
  } = useQuery({
    queryKey: qk.admin.user(userId ?? ""),
    queryFn: () => api.adminUser(userId!),
    enabled: !!userId,
  })

  const sheetErr = error instanceof Error ? error.message : "failed to load"

  const open = !!userId
  const u = detail?.user
  const subject = u
    ? u.handle
      ? `@${u.handle}`
      : (u.displayName ?? u.email)
    : "User"

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader className="border-b border-neutral">
          <SheetTitle>{subject}</SheetTitle>
          <SheetDescription>
            {u
              ? `${u.role} · joined ${new Date(u.createdAt).toLocaleDateString()}`
              : loading
                ? "Loading…"
                : sheetErr}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 text-sm">
          {loading && <PageLoading className="py-8" label="Loading…" />}
          {sheetErr && !loading && (
            <p className="text-destructive text-xs">{sheetErr}</p>
          )}
          {detail && u && (
            <>
              <div className="flex items-start gap-3">
                <Avatar
                  initial={(u.displayName || u.handle || u.email)
                    .slice(0, 1)
                    .toUpperCase()}
                  src={u.avatarUrl}
                  className="size-12 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    {u.displayName ?? u.handle ?? u.email}
                    {u.isVerified && (
                      <VerifiedBadge className="size-3.5" role={u.role} />
                    )}
                  </div>
                  {u.handle && (
                    <Link
                      to="/$handle"
                      params={{ handle: u.handle }}
                      className="text-xs text-tertiary hover:underline"
                    >
                      @{u.handle}
                    </Link>
                  )}
                  <p className="truncate text-xs text-tertiary">{u.email}</p>
                </div>
              </div>

              {u.bio && (
                <DetailSection label="Bio">
                  <p className="text-xs whitespace-pre-wrap">{u.bio}</p>
                </DetailSection>
              )}

              <DetailSection label="Totals">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-tertiary">Posts</dt>
                  <dd className="tabular-nums">{u.postsCount}</dd>
                  <dt className="text-tertiary">Followers</dt>
                  <dd className="tabular-nums">{u.followersCount}</dd>
                  <dt className="text-tertiary">Following</dt>
                  <dd className="tabular-nums">{u.followingCount}</dd>
                  <dt className="text-tertiary">Open reports</dt>
                  <dd className="tabular-nums">{u.openReportsCount}</dd>
                  <dt className="text-tertiary">Reports total</dt>
                  <dd className="tabular-nums">{u.reportsTotalCount ?? "—"}</dd>
                </dl>
              </DetailSection>

              <DetailSection label="Status">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-tertiary">User ID</dt>
                  <dd className="truncate font-mono">{u.id}</dd>
                  <dt className="text-tertiary">Role</dt>
                  <dd className="tracking-wider uppercase">{u.role}</dd>
                  <dt className="text-tertiary">Verified</dt>
                  <dd>{u.isVerified ? "yes" : "no"}</dd>
                  <dt className="text-tertiary">Banned</dt>
                  <dd className={u.banned ? "text-destructive" : ""}>
                    {u.banned
                      ? u.banExpires
                        ? `until ${new Date(u.banExpires).toLocaleString()}`
                        : "permanent"
                      : "no"}
                  </dd>
                  {u.banReason && (
                    <>
                      <dt className="text-tertiary">Ban reason</dt>
                      <dd className="text-destructive">{u.banReason}</dd>
                    </>
                  )}
                  <dt className="text-tertiary">Shadowbanned</dt>
                  <dd className={u.shadowBannedAt ? "text-destructive" : ""}>
                    {u.shadowBannedAt
                      ? `since ${new Date(u.shadowBannedAt).toLocaleString()}`
                      : "no"}
                  </dd>
                  <dt className="text-tertiary">Deleted</dt>
                  <dd className={u.deletedAt ? "text-destructive" : ""}>
                    {u.deletedAt
                      ? new Date(u.deletedAt).toLocaleString()
                      : "no"}
                  </dd>
                </dl>
              </DetailSection>

              <DetailSection
                label={`Moderation history (${detail.actions.length})`}
              >
                {detail.actions.length === 0 ? (
                  <p className="text-xs text-tertiary">
                    No moderation actions on record.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {detail.actions.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-md border border-neutral p-2 text-xs"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">
                            {actionLabel(a.action)}
                          </span>
                          <time className="text-[10px] text-tertiary">
                            {new Date(a.createdAt).toLocaleString()}
                          </time>
                        </div>
                        {a.durationHours != null && (
                          <p className="text-[10px] text-tertiary">
                            duration: {a.durationHours}h
                          </p>
                        )}
                        {a.publicReason && (
                          <p className="mt-1 whitespace-pre-wrap">
                            {a.publicReason}
                          </p>
                        )}
                        {a.privateNote && (
                          <p className="mt-1 whitespace-pre-wrap text-tertiary">
                            note: {a.privateNote}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>

              <DetailSection
                label={`Reports against (${detail.reports.length})`}
              >
                {detail.reports.length === 0 ? (
                  <p className="text-xs text-tertiary">
                    No reports filed against this user.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {detail.reports.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-neutral p-2 text-xs"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">{r.reason}</span>
                          <time className="text-[10px] text-tertiary">
                            {new Date(r.createdAt).toLocaleString()}
                          </time>
                        </div>
                        <p className="text-[10px] text-tertiary">
                          status: {r.status}
                        </p>
                        {r.details && (
                          <p className="mt-1 whitespace-pre-wrap">
                            {r.details}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>

              <DetailSection
                label={`Recent posts (${detail.recentPosts.length})`}
              >
                {detail.recentPosts.length === 0 ? (
                  <p className="text-xs text-tertiary">No posts yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {detail.recentPosts.map((p) => (
                      <li
                        key={p.id}
                        className="rounded-md border border-neutral p-2 text-xs"
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-tertiary">
                            {p.replyToId ? "reply" : "post"}
                            {p.sensitive ? " · sensitive" : ""}
                            {p.deletedAt ? " · deleted" : ""}
                          </span>
                          <time className="text-[10px] text-tertiary">
                            {new Date(p.createdAt).toLocaleString()}
                          </time>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap">
                          {p.text || (
                            <span className="text-tertiary">(no text)</span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DetailSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}
