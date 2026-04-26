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
import {
  CaretDownIcon,
  CaretUpIcon,
  ChatCircleIcon,
  EyeIcon,
  HeartIcon,
  QuotesIcon,
  RepeatIcon,
} from "@phosphor-icons/react"
import { api } from "../lib/api"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import { Avatar } from "../components/avatar"
import { PageError, PageLoading } from "../components/page-surface"
import { VerifiedBadge } from "../components/verified-badge"
import type { ColumnDef } from "@tanstack/react-table"
import type { AdminPost, AdminPostSort, AdminPostType } from "../lib/api"

export const Route = createFileRoute("/admin/posts")({ component: AdminPosts })

type TypeFilter = AdminPostType | "any"
type VisibilityFilter = "public" | "followers" | "unlisted" | "any"
type StatusFilter = "active" | "deleted" | "sensitive" | "any"

const COLUMN_WIDTHS: Record<string, string> = {
  author: "16%",
  text: "30%",
  type: "8%",
  likes: "7%",
  reposts: "7%",
  replies: "7%",
  bookmarks: "7%",
  impressions: "8%",
  created: "10%",
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
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
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
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
      {active &&
        (currentOrder === "desc" ? (
          <CaretDownIcon className="size-3" />
        ) : (
          <CaretUpIcon className="size-3" />
        ))}
    </button>
  )
}

function AdminPosts() {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<AdminPostSort>("created")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("any")
  const [visibility, setVisibility] = useState<VisibilityFilter>("any")
  const [status, setStatus] = useState<StatusFilter>("any")

  const [posts, setPosts] = useState<Array<AdminPost>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminPost | null>(null)

  // Bumped on every fresh load so in-flight loadMore results from a stale set of filters are
  // dropped instead of getting appended to the new list.
  const generationRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(
    async (
      search: string,
      s: AdminPostSort,
      o: "asc" | "desc",
      t: TypeFilter,
      v: VisibilityFilter,
      st: StatusFilter,
    ) => {
      const gen = ++generationRef.current
      setLoading(true)
      setError(null)
      try {
        const res = await api.adminPosts({
          q: search || undefined,
          sort: s,
          order: o,
          type: t,
          visibility: v,
          status: st,
        })
        if (generationRef.current !== gen) return
        setPosts(res.posts)
        setCursor(res.nextCursor)
      } catch (e) {
        if (generationRef.current !== gen) return
        setError(e instanceof Error ? e.message : "failed")
      } finally {
        if (generationRef.current === gen) setLoading(false)
      }
    },
    [],
  )

  // The two effects below split the load triggers: q is debounced so we don't fire a request
  // on every keystroke, while filter/sort changes call load synchronously. Each effect reads
  // the values it doesn't want to react to via a ref, so changing one set doesn't cancel or
  // re-run the other.
  const latestRef = useRef({ q, sort, order, typeFilter, visibility, status })
  latestRef.current = { q, sort, order, typeFilter, visibility, status }

  useEffect(() => {
    const t = setTimeout(() => {
      const v = latestRef.current
      load(v.q, v.sort, v.order, v.typeFilter, v.visibility, v.status)
    }, 250)
    return () => clearTimeout(t)
  }, [q, load])

  const isFirstFilterRunRef = useRef(true)
  useEffect(() => {
    if (isFirstFilterRunRef.current) {
      isFirstFilterRunRef.current = false
      return
    }
    const v = latestRef.current
    load(v.q, v.sort, v.order, v.typeFilter, v.visibility, v.status)
  }, [sort, order, typeFilter, visibility, status, load])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    const gen = generationRef.current
    setLoadingMore(true)
    try {
      const res = await api.adminPosts({
        q: q || undefined,
        cursor,
        sort,
        order,
        type: typeFilter,
        visibility,
        status,
      })
      if (generationRef.current !== gen) return
      setPosts((prev) => [...prev, ...res.posts])
      setCursor(res.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, q, sort, order, typeFilter, visibility, status])

  const onHeaderSort = useCallback(
    (next: AdminPostSort) => {
      if (sort === next) {
        setOrder((o) => (o === "desc" ? "asc" : "desc"))
      } else {
        setSort(next)
        setOrder("desc")
      }
    },
    [sort],
  )

  const columns = useMemo<Array<ColumnDef<AdminPost>>>(
    () => [
      {
        id: "author",
        header: "Author",
        cell: ({ row }) => {
          const a = row.original.author
          if (!a) {
            return <span className="text-xs text-muted-foreground">(unknown)</span>
          }
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar
                initial={(a.displayName || a.handle || "?").slice(0, 1).toUpperCase()}
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
                    <span className="truncate">{a.displayName ?? a.handle}</span>
                    {a.isVerified && <VerifiedBadge size={12} role={a.role} />}
                  </Link>
                ) : (
                  <span className="text-xs font-semibold">
                    {a.displayName ?? "—"}
                  </span>
                )}
                {a.handle && (
                  <p className="truncate text-[10px] text-muted-foreground">
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
                  {p.text || (
                    <span className="text-muted-foreground">(no text)</span>
                  )}
                </Link>
              ) : (
                <span className="line-clamp-2 text-xs whitespace-pre-wrap">
                  {p.text || (
                    <span className="text-muted-foreground">(no text)</span>
                  )}
                </span>
              )}
              <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                {p.visibility !== "public" && (
                  <span className="rounded bg-muted px-1">{p.visibility}</span>
                )}
                {p.sensitive && (
                  <span className="rounded bg-muted px-1 text-destructive">
                    sensitive
                  </span>
                )}
                {p.editedAt && <span>edited</span>}
                {p.deletedAt && (
                  <span className="text-destructive">deleted</span>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
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
            icon={<HeartIcon className="size-3" />}
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
            icon={<RepeatIcon className="size-3" />}
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
            icon={<ChatCircleIcon className="size-3" />}
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
            icon={<QuotesIcon className="size-3" />}
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
            icon={<EyeIcon className="size-3" />}
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
            <div className="flex items-center justify-between gap-2">
              <time
                dateTime={p.createdAt}
                title={new Date(p.createdAt).toLocaleString()}
                className="text-xs text-muted-foreground"
              >
                {formatRelative(p.createdAt)}
              </time>
              {!p.deletedAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  disabled={busyId === p.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(p)
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [sort, order, busyId, onHeaderSort],
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

  useInfiniteScrollSentinel(sentinelRef, !!cursor, loadingMore, loadMore, {
    root: scrollRoot,
  })

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border p-4">
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
      {error && <PageError message={error} />}
      {loading && posts.length === 0 && (
        <PageLoading className="py-8" label="Loading…" />
      )}
      {!loading && posts.length === 0 && !error && (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No posts match these filters.
        </div>
      )}
      {posts.length > 0 && (
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
                            header.getContext(),
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
                          cell.getContext(),
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
            await load(q, sort, order, typeFilter, visibility, status)
          } finally {
            setBusyId(null)
          }
        }}
      />
    </main>
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
      <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
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
          <div className="rounded-md border border-border p-3 text-xs">
            <p className="line-clamp-4 whitespace-pre-wrap">
              {target.text || (
                <span className="text-muted-foreground">(no text)</span>
              )}
            </p>
            {target.author?.handle && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                @{target.author.handle}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="admin-post-delete-reason"
            className="text-xs text-muted-foreground"
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
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
