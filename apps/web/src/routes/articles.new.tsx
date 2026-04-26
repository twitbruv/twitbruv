import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
import { Editor } from "../components/editor/editor"
import { PageFrame } from "../components/page-frame"
import { CoverPicker } from "../components/cover-picker"
import type { EditorPayload } from "../components/editor/editor"

export const Route = createFileRoute("/articles/new")({ component: NewArticle })

function NewArticle() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [body, setBody] = useState<EditorPayload>({ stateJson: null, text: "" })
  const [coverMediaId, setCoverMediaId] = useState<string | null>(null)
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(
    async (status: "draft" | "published") => {
      if (!title.trim()) {
        setError("title is required")
        return
      }
      setSaving(status === "draft" ? "draft" : "publish")
      setError(null)
      try {
        const { article } = await api.createArticle({
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          bodyJson: body.stateJson,
          bodyText: body.text,
          coverMediaId: coverMediaId ?? undefined,
          status,
        })
        if (status === "published" && article.author.handle) {
          router.navigate({
            to: "/$handle/a/$slug",
            params: { handle: article.author.handle, slug: article.slug },
          })
        } else {
          router.navigate({
            to: "/articles/$id/edit",
            params: { id: article.id },
          })
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "save failed")
      } finally {
        setSaving(null)
      }
    },
    [title, subtitle, body, coverMediaId, router]
  )

  const appHeader = useMemo(
    () => ({
      title: "New article" as const,
      action: (
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button
            variant="outline"
            size="sm"
            disabled={saving !== null}
            onClick={() => void save("draft")}
          >
            {saving === "draft" ? "saving…" : "save draft"}
          </Button>
          <Button
            size="sm"
            disabled={saving !== null}
            onClick={() => void save("published")}
          >
            {saving === "publish" ? "publishing…" : "publish"}
          </Button>
        </div>
      ),
    }),
    [error, saving, save]
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main className="">
        <div className="px-4 pt-6">
          <CoverPicker onChange={setCoverMediaId} />
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
        <Editor onChange={setBody} />
      </main>
    </PageFrame>
  )
}
