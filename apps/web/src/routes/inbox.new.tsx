import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { api } from "../lib/api"
import { Avatar } from "../components/avatar"
import { usePageHeader } from "../components/app-page-header"
import { PageError } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge } from "../components/verified-badge"
import type { PublicUser } from "../lib/api"

export const Route = createFileRoute("/inbox/new")({
  component: NewConversation,
})

function NewConversation() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Array<PublicUser>>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Array<PublicUser>>([])
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { users } = await api.search(q.trim())
        setResults(users.filter((u) => !selected.some((s) => s.id === u.id)))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [q, selected])

  function add(u: PublicUser) {
    setSelected((prev) =>
      prev.some((s) => s.id === u.id) ? prev : [...prev, u]
    )
    setQ("")
    setResults([])
  }

  function remove(id: string) {
    setSelected((prev) => prev.filter((u) => u.id !== id))
  }

  const start = useCallback(async () => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const ids = selected.map((u) => u.id)
      const first = ids[0]
      const { id } =
        ids.length === 1 && first
          ? await api.dmStart(first)
          : await api.dmCreateGroup(ids, title.trim() || undefined)
      router.navigate({
        to: "/inbox/$conversationId",
        params: { conversationId: id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't start conversation")
    } finally {
      setBusy(false)
    }
  }, [selected, busy, title, router])

  const isGroup = selected.length >= 2

  const appHeader = useMemo(
    () => ({
      title: "New conversation" as const,
      action: (
        <Button
          size="sm"
          disabled={selected.length === 0 || busy}
          onClick={start}
        >
          {busy ? "…" : isGroup ? "Create group" : "Message"}
        </Button>
      ),
    }),
    [selected.length, busy, isGroup, start]
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main>
        <div className="flex flex-col gap-4 px-4 py-4">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((u) => (
                <span
                  key={u.id}
                  className="flex items-center gap-1.5 rounded-full bg-muted py-1 pr-2 pl-1 text-xs"
                >
                  <Avatar
                    initial={(u.displayName || u.handle || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                    src={u.avatarUrl}
                    className="size-5"
                  />
                  <span className="flex items-center gap-1 font-medium">
                    {u.displayName ||
                      (u.handle ? `@${u.handle}` : u.id.slice(0, 8))}
                    {u.isVerified && <VerifiedBadge size={12} role={u.role} />}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(u.id)}
                    aria-label={`remove ${u.handle ?? u.id}`}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <XIcon size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-dm-search" className="text-xs text-muted-foreground">
              Search
            </Label>
            <Input
              id="new-dm-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Handle or name"
            />
          </div>

          {isGroup && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-dm-group-title" className="text-xs text-muted-foreground">
                Group name
              </Label>
              <Input
                id="new-dm-group-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional"
                maxLength={80}
              />
            </div>
          )}

          {error && <PageError className="p-0" message={error} />}

          {q.trim().length >= 2 && (
            <ul className="rounded-md border border-border">
              {searching && results.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">
                  searching…
                </li>
              )}
              {!searching && results.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">
                  no matches
                </li>
              )}
              {results.map((u) => (
                <li
                  key={u.id}
                  className="border-b border-border last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => add(u)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-muted/30"
                  >
                    <Avatar
                      initial={(u.displayName || u.handle || "?")
                        .slice(0, 1)
                        .toUpperCase()}
                      src={u.avatarUrl}
                      className="size-8"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <span className="truncate">
                          {u.displayName ||
                            (u.handle ? `@${u.handle}` : u.id.slice(0, 8))}
                        </span>
                        {u.isVerified && (
                          <VerifiedBadge size={14} role={u.role} />
                        )}
                      </div>
                      {u.handle && (
                        <div className="truncate text-xs text-muted-foreground">
                          @{u.handle}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </PageFrame>
  )
}
