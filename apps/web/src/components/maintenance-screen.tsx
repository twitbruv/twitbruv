import { APP_NAME } from "../lib/env"

const DEFAULT_MESSAGE =
  "We're temporarily down for maintenance. Check back shortly."

export function MaintenanceScreen({ message }: { message?: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">
        {APP_NAME.slice(0, 1).toLowerCase()}
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Be right back
        </h1>
        <p className="text-sm text-muted-foreground">
          {message ?? DEFAULT_MESSAGE}
        </p>
      </div>
    </div>
  )
}
