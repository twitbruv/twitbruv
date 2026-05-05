import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { Editor } from "../components/editor/editor"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge, resolveBadgeTier } from "../components/verified-badge"
import { authClient } from "../lib/auth"
import { APP_NAME } from "../lib/env"
import { buildSeoMeta, canonicalLink, clipDescription } from "../lib/seo"

export const Route = createFileRoute("/$handle/a/$slug")({
  component: ArticleView,
  loader: async ({ params, context }) => {
    const ctx = context
    try {
      const { article } = await api.userArticleBySlug(
        params.handle,
        params.slug
      )
      ctx.queryClient.setQueryData(
        qk.articles.userBySlug(params.handle, params.slug),
        article
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

  const {
    data: article,
    error,
    isPending,
  } = useQuery({
    queryKey: qk.articles.userBySlug(handle, slug),
    queryFn: async () => (await api.userArticleBySlug(handle, slug)).article,
    retry: false,
  })

  const articleError =
    error instanceof ApiError ? error.message : error ? "not found" : null

  if (articleError) {
    return (
      <PageFrame>
        <div className="px-4 py-16 text-center">
          <p className="text-muted-foreground text-sm">article not found</p>
        </div>
      </PageFrame>
    )
  }
  if (isPending || !article) {
    return (
      <PageFrame>
        <div className="px-4 py-16">
          <p className="text-muted-foreground text-sm">loading…</p>
        </div>
      </PageFrame>
    )
  }

  const isOwner = Boolean(
    session?.user && session.user.id === article.author.id
  )

  return (
    <PageFrame>
      {article.coverUrl && (
        <img
          src={article.coverUrl}
          alt=""
          className="aspect-3/1 w-full object-cover"
        />
      )}
      <header className="border-border border-b px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {article.title}
            </h1>
            {article.subtitle && (
              <p className="text-muted-foreground mt-2 text-base">
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
        <div className="text-muted-foreground mt-4 flex items-center gap-3 text-xs">
          {article.author.handle && (
            <Link
              to="/$handle"
              params={{ handle: article.author.handle }}
              className="text-foreground flex items-center gap-1 font-medium hover:underline"
            >
              {article.author.displayName || `@${article.author.handle}`}
              {(() => {
                const tier = resolveBadgeTier(article.author)
                return tier ? <VerifiedBadge size={14} role={tier} /> : null
              })()}
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
    </PageFrame>
  )
}
