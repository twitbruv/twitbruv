import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { checkSessionCookie } from "../lib/auth-fns"
import { APP_NAME } from "../lib/env"
import { PageFrame } from "../components/page-frame"

export const Route = createFileRoute("/welcome")({
  beforeLoad: async () => {
    const { hasSessionCookie } = await checkSessionCookie()
    if (hasSessionCookie) throw redirect({ to: "/" })
  },
  component: Welcome,
})

function Welcome() {
  return (
    <PageFrame>
      <main className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          A calm place to build in public
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-secondary">
          {APP_NAME} is a social layer for developers: short posts, articles,
          DMs, and repo context. No paywalls, no ads, no black-box feeds.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="md" nativeButton={false} render={<Link to="/signup" />}>
            Create an account
          </Button>
          <Button
            size="md"
            variant="outline"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            Sign in
          </Button>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">
                Posts and articles
              </span>
              <span className="text-xs text-tertiary">
                Short updates and long-form writing in one place.
              </span>
            </Card.Header>
          </Card>
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">
                Developer context
              </span>
              <span className="text-xs text-tertiary">
                Connect GitHub, GitLab, and tools you already use.
              </span>
            </Card.Header>
          </Card>
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">
                Simple analytics
              </span>
              <span className="text-xs text-tertiary">
                A creator dashboard without upsells or model-driven ranking.
              </span>
            </Card.Header>
          </Card>
          <Card>
            <Card.Header>
              <span className="text-sm font-medium text-primary">
                Your data
              </span>
              <span className="text-xs text-tertiary">
                Export and self-host with AGPL-3.0.
              </span>
            </Card.Header>
          </Card>
        </div>
      </main>
    </PageFrame>
  )
}
