import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { IconFolderPlus, IconPencil, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { Feed } from "../components/feed"
import { PageFrame } from "../components/page-frame"
import type { BookmarkFolder } from "../lib/api"

export const Route = createFileRoute("/bookmarks")({ component: Bookmarks })

type FolderSel = "all" | "unsorted" | string

function Bookmarks() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const [folders, setFolders] = useState<Array<BookmarkFolder> | null>(null)
  const [unsortedCount, setUnsortedCount] = useState<number>(0)
  const [sel, setSel] = useState<FolderSel>("all")
  const [error, setError] = useState<string | null>(null)

  async function refreshFolders() {
    try {
      const { folders: rows, unsortedCount: u } = await api.bookmarkFolders()
      setFolders(rows)
      setUnsortedCount(u)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "couldn't load folders")
    }
  }

  useEffect(() => {
    if (!session) return
    refreshFolders()
  }, [session])

  const load = useCallback(
    (cursor?: string) =>
      api.bookmarks(
        cursor,
        sel === "all" ? undefined : sel === "unsorted" ? "none" : sel,
      ),
    [sel],
  )

  async function createFolder() {
    const name = window.prompt("New folder name")?.trim()
    if (!name) return
    try {
      await api.createBookmarkFolder(name)
      await refreshFolders()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "couldn't create folder")
    }
  }
  async function renameFolder(f: BookmarkFolder) {
    const name = window.prompt("Rename folder", f.name)?.trim()
    if (!name || name === f.name) return
    try {
      await api.renameBookmarkFolder(f.id, name)
      await refreshFolders()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "couldn't rename folder")
    }
  }
  async function deleteFolder(f: BookmarkFolder) {
    if (!window.confirm(`Delete folder “${f.name}”? Bookmarks inside will move to Unsorted.`)) {
      return
    }
    try {
      await api.deleteBookmarkFolder(f.id)
      if (sel === f.id) setSel("all")
      await refreshFolders()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "couldn't delete folder")
    }
  }

  return (
    <PageFrame>
      <main>
        <header className="border-b border-border px-4 py-3">
          <h1 className="text-base font-semibold">Bookmarks</h1>
          <p className="text-xs text-muted-foreground">
            only you can see this list.
          </p>
        </header>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-2 text-sm">
          <FolderTab
            active={sel === "all"}
            onClick={() => setSel("all")}
            label="All"
          />
          <FolderTab
            active={sel === "unsorted"}
            onClick={() => setSel("unsorted")}
            label="Unsorted"
            count={unsortedCount}
          />
          {folders?.map((f) => (
            <div key={f.id} className="group flex items-center">
              <FolderTab
                active={sel === f.id}
                onClick={() => setSel(f.id)}
                label={f.name}
                count={f.bookmarkCount}
              />
              {sel === f.id && (
                <span className="ml-1 flex items-center gap-0.5">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`rename ${f.name}`}
                    onClick={() => renameFolder(f)}
                  >
                    <IconPencil size={12} stroke={1.75} />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`delete ${f.name}`}
                    onClick={() => deleteFolder(f)}
                  >
                    <IconTrash size={12} stroke={1.75} />
                  </Button>
                </span>
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={createFolder}
            className="ml-auto whitespace-nowrap"
          >
            <IconFolderPlus size={14} stroke={1.75} />
            <span>New folder</span>
          </Button>
        </div>
        {error && <p className="px-4 py-2 text-xs text-destructive">{error}</p>}
        <Feed
          key={sel}
          queryKey={["bookmarks", sel]}
          load={load}
          emptyMessage={
            sel === "all"
              ? "no bookmarks yet. tap the bookmark icon on a post to save it."
              : "this folder is empty."
          }
        />
      </main>
    </PageFrame>
  )
}

function FolderTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="ml-1.5 opacity-80">{count}</span>
      )}
    </button>
  )
}
