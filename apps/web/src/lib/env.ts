export const API_URL =
  import.meta.env.VITE_PUBLIC_API_URL ?? "http://localhost:3001"
export const WEB_URL =
  import.meta.env.VITE_PUBLIC_WEB_URL ?? "http://localhost:3000"
export const APP_NAME = import.meta.env.VITE_PUBLIC_APP_NAME ?? "twotter"
export const DATABUDDY_CLIENT_ID = import.meta.env
  .VITE_PUBLIC_DATABUDDY_CLIENT_ID

// Build-time hard block. When true the app refuses to render anything beyond the
// maintenance screen — used as a belt-and-suspenders companion to the server-side
// MAINTENANCE_MODE so cached clients don't even attempt API calls during incidents.
export const MAINTENANCE_MODE =
  import.meta.env.VITE_PUBLIC_MAINTENANCE_MODE === "true"
