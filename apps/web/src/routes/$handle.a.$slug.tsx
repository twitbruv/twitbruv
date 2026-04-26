import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { Editor } from "../components/editor/editor"
import { VerifiedBadge } from "../components/verified-badge"
import { authClient } from "../lib/auth"
import { APP_NAME } from "../lib/env"
import { buildSeoMeta, canonicalLink, clipDescription } from "../lib/seo"
import type { ArticleDto } from "../lib/api"

export const Route = createFileRoute("/$handle/a/$slug")({
  component: ArticleView,
  loader: async ({ params }) => {
    try {
      const { article } = await api.userArticleBySlug(
        params.handle,
        params.slug
      )
      return { article }
    } catch {
      return { article: null }
    }
  },
  head: ({ loaderData, params }) => {
    const article = loaderData?.article ?? null
    const path = `/${params.handle}/a/${params.slug}`
    if (!article) {
      return {
        meta: buildSeoMeta({
          title: "Article not found",
          description: `This article on ${APP_NAME} either doesn't exist or has been removed.`,
          path,
        }),
        links: [canonicalLink(path)],
      }
    }
    const description = clipDescription(
      article.subtitle ||
        article.bodyText ||
        `An article by @${params.handle} on ${APP_NAME}.`
    )
    return {
      meta: buildSeoMeta({
        title: article.title,
        description,
        path,
        image:
          article.coverUrl ?? `/og/article/${params.handle}/${params.slug}`,
        type: "article",
        largeCard: true,
        publishedTime: article.publishedAt ?? undefined,
        authorHandle: article.author.handle ?? undefined,
      }),
      links: [canonicalLink(path)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.subtitle ?? description,
            image: article.coverUrl ?? undefined,
            datePublished: article.publishedAt ?? undefined,
            dateModified: article.editedAt ?? article.publishedAt ?? undefined,
            wordCount: article.wordCount,
            author: article.author.handle
              ? {
                  "@type": "Person",
                  name: article.author.displayName ?? article.author.handle,
                  url: `/${article.author.handle}`,
                }
              : undefined,
            mainEntityOfPage: path,
          }),
        },
      ],
    }
  },
})

function ArticleView() {
  const { handle, slug } = Route.useParams()
  const { data: session } = authClient.useSession()
  const [article, setArticle] = useState<ArticleDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setArticle(null)
    setError(null)
    api
      .userArticleBySlug(handle, slug)
      .then(({ article: next }) => setArticle(next))
      .catch((e) => setError(e instanceof ApiError ? e.message : "not found"))
  }, [handle, slug])

  if (error) {
    return (
      <main className="px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">article not found</p>
      </main>
    )
  }
  if (!article) {
    return (
      <main className="px-4 py-16">
        <p className="text-sm text-muted-foreground">loading…</p>
      </main>
    )
  }

  const isOwner = Boolean(
    session?.user && session.user.id === article.author.id
  )

  return (
    <main className="">
      {article.coverUrl && (
        <img
          src={article.coverUrl}
          alt=""
          className="aspect-[3/1] w-full object-cover"
        />
      )}
      <header className="border-b border-border px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {article.title}
            </h1>
            {article.subtitle && (
              <p className="mt-2 text-base text-muted-foreground">
                {article.subtitle}
              </p>
            )}
          </div>
          {isOwner && (
            <Link to="/articles/$id/edit" params={{ id: article.id }}>
              <Button size="sm" variant="outline">
                edit
              </Button>
            </Link>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
          {article.author.handle && (
            <Link
              to="/$handle"
              params={{ handle: article.author.handle }}
              className="flex items-center gap-1 font-medium text-foreground hover:underline"
            >
              {article.author.displayName || `@${article.author.handle}`}
              {article.author.isVerified && (
                <VerifiedBadge size={14} role={article.author.role} />
              )}
            </Link>
          )}
          <span>·</span>
          {article.publishedAt && (
            <time dateTime={article.publishedAt}>
              {new Date(article.publishedAt).toLocaleDateString()}
            </time>
          )}
          <span>·</span>
          <span>{article.readingMinutes} min read</span>
          {article.editedAt &&
            article.publishedAt &&
            article.editedAt > article.publishedAt && (
              <>
                <span>·</span>
                <span>updated</span>
              </>
            )}
        </div>
      </header>
      <Editor initialStateJson={article.bodyJson ?? null} readOnly />
    </main>
  )
}
