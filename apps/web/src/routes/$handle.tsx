import { Outlet, createFileRoute } from "@tanstack/react-router"
import { PageFrame } from "../components/page-frame"

// Parent layout for all /$handle/... routes. Static routes (/login, /settings, /hashtag/:tag)
// take precedence via TanStack Router's static-before-dynamic matcher; reserved handles
// are enforced on the API side at claim time so collisions can't happen going forward.
export const Route = createFileRoute("/$handle")({
  component: HandleLayout,
  notFoundComponent: HandleNotFound,
})

function HandleLayout() {
  return (
    <PageFrame>
      <Outlet />
    </PageFrame>
  )
}

function HandleNotFound() {
  return (
    <PageFrame>
      <main className="p-4 pt-16">
        <h1 className="text-lg font-semibold">404</h1>
        <p className="text-sm text-muted-foreground">
          That page doesn't exist.
        </p>
      </main>
    </PageFrame>
  )
}
