export const API_URL =
  import.meta.env.VITE_PUBLIC_API_URL ?? "http://localhost:3001"
export const WEB_URL =
  import.meta.env.VITE_PUBLIC_WEB_URL ?? "http://localhost:3000"
export const APP_NAME = import.meta.env.VITE_PUBLIC_APP_NAME ?? "twotter"
export const DATABUDDY_CLIENT_ID = import.meta.env
  .VITE_PUBLIC_DATABUDDY_CLIENT_ID as string | undefined
