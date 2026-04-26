import { Link, createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import { api } from "../lib/api"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import { Avatar } from "../components/avatar"
import { PageEmpty, PageLoading } from "../components/page-surface"
import {
  UnderlineTabButton,
  UnderlineTabRow,
} from "../components/underline-tab-row"
import type { ColumnDef } from "@tanstack/react-table"
import type {
  AdminReport,
  AdminReportDetail,
  AdminReportSubject,
  ReportStatus,
} from "../lib/api"

export const Route = createFileRoute("/admin/reports")({
  component: AdminReports,
})

const STATUSES: Array<ReportStatus> = [
  "open",
  "triaged",
  "actioned",
  "dismissed",
]
type Resolution = "triaged" | "actioned" | "dismissed"

function AdminReports() {
  const [status, setStatus] = useState<ReportStatus>("open")
  const [reports, setReports] = useState<Array<AdminReport>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Bumped on every fresh load so in-flight loadMore results from a prior
  // status change are discarded instead of getting appended to the new list.
  const generationRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)

  const load = useCallback(async (s: ReportStatus) => {
    const gen = ++generationRef.current
    setLoading(true)
    try {
      const res = await api.adminReports(s)
      if (generationRef.current !== gen) return
      setReports(res.reports)
      setCursor(res.nextCursor)
    } finally {
      if (generationRef.current === gen) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(status)
  }, [status, load])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    const gen = generationRef.current
    setLoadingMore(true)
    try {
      const res = await api.adminReports(status, cursor)
      if (generationRef.current !== gen) return
      setReports((prev) => [...prev, ...res.reports])
      setCursor(res.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, status])

  useInfiniteScrollSentinel(sentinelRef, !!cursor, loadingMore, loadMore, {
    root: scrollRoot,
  })

  const columns = useMemo<Array<ColumnDef<AdminReport>>>(
    () => [
      {
        id: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <span className="text-sm font-semibold">{row.original.reason}</span>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.subjectType} {row.original.subjectId.slice(0, 8)}
          </span>
        ),
      },
      {
        id: "reporter",
        header: "Reporter",
        cell: ({ row }) => {
          const rep = row.original.reporter
          if (!rep) {
            return (
              <span className="text-xs text-muted-foreground">(unknown)</span>
            )
          }
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar
                initial={(rep.displayName || rep.handle || "?")
                  .slice(0, 1)
                  .toUpperCase()}
                src={rep.avatarUrl}
                className="size-6 shrink-0"
              />
              {rep.handle ? (
                <Link
                  to="/$handle"
                  params={{ handle: rep.handle }}
                  className="truncate text-xs hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{rep.handle}
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">(unknown)</span>
              )}
            </div>
          )
        },
      },
      {
        id: "createdAt",
        header: "Reported",
        cell: ({ row }) => (
          <time className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString()}
          </time>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: reports,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <UnderlineTabRow className="px-0">
        {STATUSES.map((s) => (
          <UnderlineTabButton
            key={s}
            active={s === status}
            onClick={() => setStatus(s)}
            className="capitalize"
          >
            {s}
          </UnderlineTabButton>
        ))}
      </UnderlineTabRow>
      <div
        ref={setScrollRoot}
        className="flex-1 overflow-auto overscroll-contain"
      >
        {loading && reports.length === 0 && (
          <PageLoading className="py-8" label="Loading…" />
        )}
        {!loading && reports.length === 0 && (
          <PageEmpty
            title={`No ${status} reports`}
            description="Change the status filter or check back later."
            className="py-8"
          />
        )}
        {reports.length > 0 && (
          <Table>
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
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={
                    row.original.id === selectedId ? "selected" : undefined
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
              ))}
            </TableBody>
          </Table>
        )}
        <div ref={sentinelRef} aria-hidden className="h-px" />
        {cursor && (
          <div className="flex justify-center py-3 text-xs text-muted-foreground">
            {loadingMore ? "loading…" : ""}
          </div>
        )}
      </div>
      <ReportSheet
        reportId={selectedId}
        onClose={() => setSelectedId(null)}
        onResolved={() => {
          setSelectedId(null)
          load(status)
        }}
      />
    </main>
  )
}

function ReportSheet({
  reportId,
  onClose,
  onResolved,
}: {
  reportId: string | null
  onClose: () => void
  onResolved: () => void
}) {
  const [detail, setDetail] = useState<AdminReportDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<Resolution | null>(null)

  useEffect(() => {
    if (!reportId) {
      setDetail(null)
      setNote("")
      setBusy(null)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .adminReportDetail(reportId)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setNote(d.resolutionNote ?? "")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reportId])

  async function resolve(next: Resolution) {
    if (!detail) return
    setBusy(next)
    try {
      await api.adminResolveReport(detail.id, {
        status: next,
        resolutionNote: note.trim() || undefined,
      })
      onResolved()
    } finally {
      setBusy(null)
    }
  }

  const open = !!reportId
  const isOpen = !!detail && detail.status === "open"

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{detail?.reason ?? "Report"}</SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.subjectType} · ${new Date(detail.createdAt).toLocaleString()} · ${detail.status}`
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 text-sm">
          {loading && !detail && (
            <p className="text-muted-foreground">loading…</p>
          )}
          {detail && (
            <>
              <Reporter reporter={detail.reporter} />
              {detail.details && (
                <Section label="Reporter notes">
                  <p className="whitespace-pre-wrap">{detail.details}</p>
                </Section>
              )}
              <SubjectPreview subject={detail.subject} />
              {detail.resolutionNote && !isOpen && (
                <Section label="Resolution note">
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {detail.resolutionNote}
                  </p>
                </Section>
              )}
              {isOpen && (
                <Section label="Resolution note (optional)">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="What action was taken?"
                    className="resize-y bg-transparent text-xs md:text-xs"
                  />
                </Section>
              )}
            </>
          )}
        </div>
        {isOpen && (
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() => resolve("dismissed")}
            >
              {busy === "dismissed" ? "Working…" : "Dismiss"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => resolve("triaged")}
            >
              {busy === "triaged" ? "Working…" : "Triage"}
            </Button>
            <Button
              size="sm"
              variant="default"
              disabled={!!busy}
              onClick={() => resolve("actioned")}
            >
              {busy === "actioned" ? "Working…" : "Action"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

function Reporter({ reporter }: { reporter: AdminReportDetail["reporter"] }) {
  if (!reporter) {
    return (
      <Section label="Reporter">
        <span className="text-muted-foreground">(unknown)</span>
      </Section>
    )
  }
  return (
    <Section label="Reporter">
      <div className="flex items-center gap-2">
        <Avatar
          initial={(reporter.displayName || reporter.handle || "?")
            .slice(0, 1)
            .toUpperCase()}
          src={reporter.avatarUrl}
          className="size-7 shrink-0"
        />
        {reporter.handle ? (
          <Link
            to="/$handle"
            params={{ handle: reporter.handle }}
            className="hover:underline"
          >
            @{reporter.handle}
          </Link>
        ) : (
          <span>{reporter.displayName ?? "(unknown)"}</span>
        )}
      </div>
    </Section>
  )
}

function SubjectPreview({ subject }: { subject: AdminReportSubject | null }) {
  if (!subject) {
    return (
      <Section label="Subject">
        <span className="text-muted-foreground">
          Subject not found (may have been hard-deleted).
        </span>
      </Section>
    )
  }
  if (subject.type === "post") {
    const p = subject.post
    return (
      <Section label="Reported post">
        <div className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Avatar
              initial={(p.author?.displayName || p.author?.handle || "?")
                .slice(0, 1)
                .toUpperCase()}
              src={p.author?.avatarUrl ?? null}
              className="size-7 shrink-0"
            />
            <div className="min-w-0 text-xs">
              {p.author?.handle ? (
                <Link
                  to="/$handle"
                  params={{ handle: p.author.handle }}
                  className="font-semibold hover:underline"
                >
                  @{p.author.handle}
                </Link>
              ) : (
                <span className="font-semibold">(deleted user)</span>
              )}
              <span className="ml-2 text-muted-foreground">
                {new Date(p.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          {p.deletedAt && (
            <p className="mb-2 text-xs text-destructive">
              Deleted {new Date(p.deletedAt).toLocaleString()}
            </p>
          )}
          {p.sensitive && (
            <p className="mb-2 text-xs text-muted-foreground">
              Marked sensitive{p.contentWarning ? `: ${p.contentWarning}` : ""}
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap">{p.text}</p>
          {p.author?.handle && (
            <Link
              to="/$handle/p/$id"
              params={{ handle: p.author.handle, id: p.id }}
              className="mt-2 inline-block text-xs text-muted-foreground hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Open post →
            </Link>
          )}
        </div>
      </Section>
    )
  }
  if (subject.type === "user") {
    const u = subject.user
    return (
      <Section label="Reported user">
        <div className="flex items-center gap-2 rounded-md border border-border p-3">
          <Avatar
            initial={(u.displayName || u.handle || "?")
              .slice(0, 1)
              .toUpperCase()}
            src={u.avatarUrl}
            className="size-8 shrink-0"
          />
          <div className="min-w-0 text-xs">
            {u.handle ? (
              <Link
                to="/$handle"
                params={{ handle: u.handle }}
                className="font-semibold hover:underline"
              >
                @{u.handle}
              </Link>
            ) : (
              <span className="font-semibold">(no handle)</span>
            )}
            {u.displayName && (
              <p className="text-muted-foreground">{u.displayName}</p>
            )}
            {u.banned && <p className="text-destructive">banned</p>}
          </div>
        </div>
      </Section>
    )
  }
  return (
    <Section label="Subject">
      <span className="font-mono text-xs text-muted-foreground">
        {subject.subjectType} {subject.subjectId}
      </span>
    </Section>
  )
}
