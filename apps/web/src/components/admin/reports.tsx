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
import { ShieldCheckIcon } from "@heroicons/react/24/solid"
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
import { Avatar } from "@workspace/ui/components/avatar"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { api } from "../../lib/api"
import { qk } from "../../lib/query-keys"
import { useInfiniteScrollSentinel } from "../../lib/use-infinite-scroll-sentinel"
import { PageEmpty, PageLoading } from "../page-surface"
import { PageFrame } from "../page-frame"
import type { ColumnDef } from "@tanstack/react-table"
import type {
  AdminReport,
  AdminReportDetail,
  AdminReportSubject,
  ReportStatus,
} from "../../lib/api"

const STATUSES: Array<ReportStatus> = [
  "open",
  "triaged",
  "actioned",
  "dismissed",
]

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  triaged: "Triaged",
  actioned: "Actioned",
  dismissed: "Dismissed",
}

type Resolution = "triaged" | "actioned" | "dismissed"

export default function AdminReports() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<ReportStatus>("open")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)

  const { data, isPending, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: qk.admin.reports(status),
      queryFn: ({ pageParam }) => api.adminReports(status, pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    })

  const reports = useMemo(
    () => data?.pages.flatMap((p) => p.reports) ?? [],
    [data]
  )

  const loadMore = useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  useInfiniteScrollSentinel(
    sentinelRef,
    Boolean(hasNextPage),
    isFetchingNextPage,
    loadMore,
    {
      root: scrollRoot,
    }
  )

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
          <span className="text-muted-foreground font-mono text-xs">
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
              <span className="text-muted-foreground text-xs">System</span>
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
                <span className="text-muted-foreground text-xs">(unknown)</span>
              )}
            </div>
          )
        },
      },
      {
        id: "createdAt",
        header: "Reported",
        cell: ({ row }) => (
          <time className="text-muted-foreground text-xs">
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
    <PageFrame className="flex flex-col">
      <div className="shrink-0 px-4 py-3">
        <SegmentedControl<ReportStatus>
          layout="fit"
          variant="ghost"
          value={status}
          options={STATUSES.map((s) => ({
            value: s,
            label: STATUS_LABELS[s],
          }))}
          onValueChange={(value) => setStatus(value)}
        />
      </div>
      <div ref={setScrollRoot} className="flex-1">
        {isPending && reports.length === 0 && (
          <PageLoading className="py-8" label="Loading…" />
        )}
        {!isPending && reports.length === 0 && (
          <PageEmpty
            icon={<ShieldCheckIcon />}
            title={`No ${status} reports`}
            description="Change the status filter above or check back later. The queue is clear."
            className="py-8"
          />
        )}
        {reports.length > 0 && (
          <Table>
            <TableHeader className="bg-background sticky top-0 z-10">
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
        {hasNextPage && (
          <div className="text-muted-foreground flex justify-center py-3 text-xs">
            {isFetchingNextPage ? "loading…" : ""}
          </div>
        )}
      </div>
      <ReportSheet
        reportId={selectedId}
        onClose={() => setSelectedId(null)}
        onResolved={() => {
          setSelectedId(null)
          void qc.invalidateQueries({ queryKey: qk.admin.reports(status) })
        }}
      />
    </PageFrame>
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
  const qc = useQueryClient()

  const { data: detail, isPending: loading } = useQuery({
    queryKey: qk.admin.report(reportId ?? ""),
    queryFn: () => api.adminReportDetail(reportId!),
    enabled: !!reportId,
  })

  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<Resolution | null>(null)

  useEffect(() => {
    if (!reportId) {
      setNote("")
      setBusy(null)
      return
    }
    if (detail) setNote(detail.resolutionNote ?? "")
  }, [reportId, detail?.id])

  async function resolve(next: Resolution) {
    if (!detail) return
    setBusy(next)
    try {
      await api.adminResolveReport(detail.id, {
        status: next,
        resolutionNote: note.trim() || undefined,
      })
      await qc.invalidateQueries({ queryKey: qk.admin.report(detail.id) })
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
        <SheetHeader className="border-border border-b">
          <SheetTitle>{detail?.reason ?? "Report"}</SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.subjectType} · ${new Date(detail.createdAt).toLocaleString()} · ${detail.status}`
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 text-sm">
          {loading && <PageLoading className="py-8" label="Loading…" />}
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
                  <p className="text-muted-foreground whitespace-pre-wrap">
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
          <SheetFooter className="border-border flex-row justify-end gap-2 border-t">
            <Button
              size="sm"
              variant="transparent"
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
              variant="outline"
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
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
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
        <span className="text-muted-foreground">System</span>
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
        <div className="border-border rounded-md border p-3">
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
              <span className="text-muted-foreground ml-2">
                {new Date(p.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          {p.deletedAt && (
            <p className="text-destructive mb-2 text-xs">
              Deleted {new Date(p.deletedAt).toLocaleString()}
            </p>
          )}
          {p.sensitive && (
            <p className="text-muted-foreground mb-2 text-xs">
              Marked sensitive{p.contentWarning ? `: ${p.contentWarning}` : ""}
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap">{p.text}</p>
          {p.author?.handle && (
            <Link
              to="/$handle/p/$id"
              params={{ handle: p.author.handle, id: p.id }}
              className="text-muted-foreground mt-2 inline-block text-xs hover:underline"
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
        <div className="border-border flex items-center gap-2 rounded-md border p-3">
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
      <span className="text-muted-foreground font-mono text-xs">
        {subject.subjectType} {subject.subjectId}
      </span>
    </Section>
  )
}
