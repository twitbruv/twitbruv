import { Link } from "@tanstack/react-router"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/solid"
import { Avatar } from "@workspace/ui/components/avatar"
import { api } from "../../lib/api"
import { qk } from "../../lib/query-keys"
import { useInfiniteScrollSentinel } from "../../lib/use-infinite-scroll-sentinel"
import { PageError, PageLoading } from "../page-surface"
import { PageFrame } from "../page-frame"
import { VerifiedBadge, resolveBadgeTier } from "../verified-badge"
import type { AdminPostFilters } from "../../lib/query-keys"
import type { ColumnDef } from "@tanstack/react-table"
import type { AdminPost, AdminPostSort, AdminPostType } from "../../lib/api"

type TypeFilter = AdminPostType | "any"
type VisibilityFilter = "public" | "followers" | "unlisted" | "any"
type StatusFilter = "active" | "deleted" | "sensitive" | "any"

const COLUMN_WIDTHS: Record<string, string> = {
  author: "14%",
  text: "21%",
  type: "7%",
  likes: "6%",
  reposts: "6%",
  replies: "6%",
  bookmarks: "6%",
  impressions: "7%",
  reports: "7%",
  created: "7%",
  actions: "6%",
}

const SORT_LABELS: Record<AdminPostSort, string> = {
  created: "Newest",
  likes: "Most likes",
  reposts: "Most reposts",
  replies: "Most replies",
  quotes: "Most quotes",
  bookmarks: "Most bookmarks",
  impressions: "Most impressions",
}

function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n < 1000) return String(n)
  if (n < 1_000_000)
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
  if (n < 1_000_000_000)
    return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "")}M`
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString()
}

function StatHeader({
  label,
  sortKey,
  icon,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string
  sortKey: AdminPostSort
  icon?: React.ReactNode
  currentSort: AdminPostSort
  currentOrder: "asc" | "desc"
  onSort: (next: AdminPostSort) => void
}) {
  const active = currentSort === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-xs ${
        active ? "text-primary" : "text-tertiary hover:text-primary"
      }`}
    >
      {icon}
      <span>{label}</span>
      {active &&
        (currentOrder === "desc" ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronUpIcon className="size-3" />
        ))}
    </button>
  )
}

export default function AdminPosts() {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const [sort, setSort] = useState<AdminPostSort>("created")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("any")
  const [visibility, setVisibility] = useState<VisibilityFilter>("any")
  const [status, setStatus] = useState<StatusFilter>("any")

  const filters = useMemo(
    (): AdminPostFilters => ({
      q: debouncedQ.trim() || undefined,
      sort,
      order,
      type: typeFilter,
      visibility,
      status,
    }),
    [debouncedQ, sort, order, typeFilter, visibility, status]
  )

  const {
    data,
    error,
    isPending,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: qk.admin.posts(filters),
    queryFn: ({ pageParam }) =>
      api.adminPosts({
        q: filters.q,
        cursor: pageParam,
        sort,
        order,
        type: typeFilter,
        visibility,
        status,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const posts = useMemo(() => data?.pages.flatMap((p) => p.posts) ?? [], [data])

  const loadError = error instanceof Error ? error.message : "failed to load"

  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminPost | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  const onHeaderSort = useCallback(
    (next: AdminPostSort) => {
      if (sort === next) {
        setOrder((o) => (o === "desc" ? "asc" : "desc"))
      } else {
        setSort(next)
        setOrder("desc")
      }
    },
    [sort]
  )

  const columns = useMemo<Array<ColumnDef<AdminPost>>>(
    () => [
      {
        id: "author",
        header: "Author",
        cell: ({ row }) => {
          const a = row.original.author
          if (!a) {
            return <span className="text-xs text-tertiary">(unknown)</span>
          }
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar
                initial={(a.displayName || a.handle || "?")
                  .slice(0, 1)
                  .toUpperCase()}
                src={a.avatarUrl}
                className="size-7 shrink-0"
              />
              <div className="min-w-0">
                {a.handle ? (
                  <Link
                    to="/$handle"
                    params={{ handle: a.handle }}
                    className="flex items-center gap-1 text-xs font-semibold hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="truncate">
                      {a.displayName ?? a.handle}
                    </span>
                    {(() => {
                      const tier = resolveBadgeTier(a)
                      return tier ? (
                        <VerifiedBadge className="size-3" role={tier} />
                      ) : null
                    })()}
                  </Link>
                ) : (
                  <span className="text-xs font-semibold">
                    {a.displayName ?? "—"}
                  </span>
                )}
                {a.handle && (
                  <p className="truncate text-[10px] text-tertiary">
                    @{a.handle}
                  </p>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: "text",
        header: "Post",
        cell: ({ row }) => {
          const p = row.original
          const author = p.author
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              {author?.handle ? (
                <Link
                  to="/$handle/p/$id"
                  params={{ handle: author.handle, id: p.id }}
                  className="line-clamp-2 text-xs whitespace-pre-wrap hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {p.text || <span className="text-tertiary">(no text)</span>}
                </Link>
              ) : (
                <span className="line-clamp-2 text-xs whitespace-pre-wrap">
                  {p.text || <span className="text-tertiary">(no text)</span>}
                </span>
              )}
              <div className="flex flex-wrap gap-1 text-[10px] text-tertiary">
                {p.visibility !== "public" && (
                  <span className="rounded bg-base-2 px-1">{p.visibility}</span>
                )}
                {p.sensitive && (
                  <span className="rounded bg-base-2 px-1 text-danger">
                    sensitive
                  </span>
                )}
                {p.editedAt && <span>edited</span>}
                {p.deletedAt && <span className="text-danger">deleted</span>}
              </div>
            </div>
          )
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span className="text-[10px] tracking-wider text-tertiary uppercase">
            {row.original.postType}
          </span>
        ),
      },
      {
        id: "likes",
        header: () => (
          <StatHeader
            label="Likes"
            sortKey="likes"
            currentSort={sort}
            currentOrder={order}
            onSort={onHeaderSort}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {compactNumber(row.original.likeCount)}
          </span>
        ),
      },
      {
        id: "reposts",
        header: () => (
          <StatHeader
            label="Reposts"
            sortKey="reposts"
            currentSort={sort}
            currentOrder={order}
            onSort={onHeaderSort}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {compactNumber(row.original.repostCount)}
          </span>
        ),
      },
      {
        id: "replies",
        header: () => (
          <StatHeader
            label="Replies"
            sortKey="replies"
            currentSort={sort}
            currentOrder={order}
            onSort={onHeaderSort}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {compactNumber(row.original.replyCount)}
          </span>
        ),
      },
      {
        id: "bookmarks",
        header: () => (
          <StatHeader
            label="Saves"
            sortKey="bookmarks"
            currentSort={sort}
            currentOrder={order}
            onSort={onHeaderSort}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {compactNumber(row.original.bookmarkCount)}
          </span>
        ),
      },
      {
        id: "impressions",
        header: () => (
          <StatHeader
            label="Views"
            sortKey="impressions"
            currentSort={sort}
            currentOrder={order}
            onSort={onHeaderSort}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {compactNumber(row.original.impressionCount)}
          </span>
        ),
      },
      {
        id: "reports",
        header: "Reports",
        cell: ({ row }) => {
          const p = row.original
          const open = p.reportsOpen
          const total = p.reportsTotal
          const tone =
            open > 0 ? "text-amber-600 dark:text-amber-500" : "text-tertiary"
          return (
            <span className={`text-xs tabular-nums ${tone}`}>
              {open}/{total}
            </span>
          )
        },
      },
      {
        id: "created",
        header: () => (
          <StatHeader
            label="Created"
            sortKey="created"
            currentSort={sort}
            currentOrder={order}
            onSort={onHeaderSort}
          />
        ),
        cell: ({ row }) => {
          const p = row.original
          return (
            <time
              dateTime={p.createdAt}
              title={new Date(p.createdAt).toLocaleString()}
              className="text-xs text-tertiary"
            >
              {formatRelative(p.createdAt)}
            </time>
          )
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const p = row.original
          if (p.deletedAt) return null
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
                      disabled={busyId === p.id}
                      className="size-7 p-0"
                      aria-label="Open post actions"
                    />
                  }
                >
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item
                    variant="danger"
                    onClick={() => setDeleteTarget(p)}
                  >
                    Delete post…
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
          )
        },
      },
    ],
    [sort, order, busyId, onHeaderSort]
  )

  const table = useReactTable({
    data: posts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const rows = table.getRowModel().rows
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 72,
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
      <div className="shrink-0 space-y-3 border-b border-neutral p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search by post text or author handle…"
        />
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Sort">
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as AdminPostSort)}
            >
              <SelectTrigger size="sm" className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as Array<AdminPostSort>).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Direction">
            <Select
              value={order}
              onValueChange={(v) => setOrder(v as "asc" | "desc")}
            >
              <SelectTrigger size="sm" className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Type">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as TypeFilter)}
            >
              <SelectTrigger size="sm" className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="reply">Reply</SelectItem>
                <SelectItem value="repost">Repost</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Visibility">
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as VisibilityFilter)}
            >
              <SelectTrigger size="sm" className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="followers">Followers</SelectItem>
                <SelectItem value="unlisted">Unlisted</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as StatusFilter)}
            >
              <SelectTrigger size="sm" className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
                <SelectItem value="sensitive">Sensitive</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </div>
      {loadError && <PageError message={loadError} />}
      {isPending && posts.length === 0 && (
        <PageLoading className="py-8" label="Loading…" />
      )}
      {!isPending && posts.length === 0 && !loadError && (
        <div className="py-8 text-center text-xs text-tertiary">
          No posts match these filters.
        </div>
      )}
      {posts.length > 0 && (
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
                    ref={(node: HTMLTableRowElement | null) =>
                      rowVirtualizer.measureElement(node)
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-top">
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
      <DeletePostDialog
        target={deleteTarget}
        busy={busyId === deleteTarget?.id}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async (reason) => {
          if (!deleteTarget) return
          const id = deleteTarget.id
          setBusyId(id)
          try {
            await api.adminDeletePost(id, { reason: reason || undefined })
            setDeleteTarget(null)
            await qc.invalidateQueries({ queryKey: qk.admin.posts(filters) })
          } finally {
            setBusyId(null)
          }
        }}
      />
    </PageFrame>
  )
}

function FilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

function DeletePostDialog({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: AdminPost | null
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (target) {
      setReason("")
      setError(null)
    }
  }, [target])

  const open = !!target

  async function submit() {
    setError(null)
    try {
      await onConfirm(reason.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete post</DialogTitle>
          <DialogDescription>
            Soft-deletes the post and records this action in the moderation log.
          </DialogDescription>
        </DialogHeader>
        {target && (
          <div className="rounded-md border border-neutral p-3 text-xs">
            <p className="line-clamp-4 whitespace-pre-wrap">
              {target.text || <span className="text-tertiary">(no text)</span>}
            </p>
            {target.author?.handle && (
              <p className="mt-2 text-[10px] text-tertiary">
                @{target.author.handle}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="admin-post-delete-reason"
            className="text-xs text-tertiary"
          >
            Reason (optional)
          </Label>
          <Input
            id="admin-post-delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <DialogFooter>
          <Button
            size="sm"
            variant="transparent"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={submit} disabled={busy}>
            {busy ? "Deleting…" : "Delete post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
