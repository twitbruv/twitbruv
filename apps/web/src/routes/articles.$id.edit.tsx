import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { Editor } from "../components/editor/editor"
import { PageFrame } from "../components/page-frame"
import { CoverPicker } from "../components/cover-picker"
import type { ArticleDto } from "../lib/api"
import type { EditorPayload } from "../components/editor/editor"

export const Route = createFileRoute("/articles/$id/edit")({
  component: EditArticle,
})

function EditArticle() {
  const { id } = Route.useParams()
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const [article, setArticle] = useState<ArticleDto | null>(null)
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [body, setBody] = useState<EditorPayload | null>(null)
  const [coverMediaId, setCoverMediaId] = useState<string | null | undefined>(
    undefined
  )
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .article(id)
      .then(({ article }) => {
        setArticle(article)
        setTitle(article.title)
        setSubtitle(article.subtitle ?? "")
      })
      .catch((e) =>
        setLoadError(e instanceof ApiError ? e.message : "not found")
      )
  }, [id])

  // Memoize the initial JSON so the Lexical composer isn't re-initialized on every render.
  const initialStateJson = useMemo(
    () => article?.bodyJson ?? null,
    [article?.id]
  )

  async function save(status: "draft" | "published") {
    if (!article) return
    setSaving(status === "draft" ? "draft" : "publish")
    setError(null)
    try {
      const { article: updated } = await api.updateArticle(article.id, {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        bodyJson: body?.stateJson ?? article.bodyJson,
        bodyText: body?.text ?? article.bodyText,
        // `undefined` = leave alone, `null`/value = explicit change.
        ...(coverMediaId !== undefined
          ? { coverMediaId: coverMediaId ?? undefined }
          : {}),
        status,
      })
      setArticle(updated)
      if (status === "published" && updated.author.handle) {
        router.navigate({
          to: "/$handle/a/$slug",
          params: { handle: updated.author.handle, slug: updated.slug },
        })
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "save failed")
    } finally {
      setSaving(null)
    }
  }

  if (loadError) {
    return (
      <PageFrame>
        <main className="px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">article not found</p>
        </main>
      </PageFrame>
    )
  }
  if (!article) {
    return (
      <PageFrame>
        <main className="px-4 py-16">
          <p className="text-sm text-muted-foreground">loading…</p>
        </main>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <main className="">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h1 className="text-sm font-semibold text-muted-foreground">
            {article.status === "draft" ? "draft" : "editing"} ·{" "}
            {article.readingMinutes} min read
          </h1>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-destructive">{error}</span>}
            {article.status !== "published" && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving !== null}
                onClick={() => save("draft")}
              >
                {saving === "draft" ? "saving…" : "save draft"}
              </Button>
            )}
            <Button
              size="sm"
              disabled={saving !== null}
              onClick={() => save("published")}
            >
              {saving === "publish"
                ? "saving…"
                : article.status === "published"
                  ? "save changes"
                  : "publish"}
            </Button>
          </div>
        </header>
        <div className="px-4 pt-6">
          <CoverPicker
            initialUrl={article.coverUrl ?? null}
            onChange={setCoverMediaId}
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="title"
            className="mt-4 h-auto border-0 px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
            maxLength={150}
          />
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="subtitle (optional)"
            className="mt-2 h-auto border-0 px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
            maxLength={200}
          />
        </div>
        <Editor initialStateJson={initialStateJson} onChange={setBody} />
      </main>
    </PageFrame>
  )
}
