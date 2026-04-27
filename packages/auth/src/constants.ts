// Side-effect-free constants safe to import from any environment (web client,
// SSR, edge middleware, api server). Kept out of `./server.ts` so consumers
// who only need the cookie name don't pull in drizzle, the email senders, or
// the better-auth plugin chain.
export const COOKIE_PREFIX = "twotter"
export const SESSION_COOKIE_NAME = `${COOKIE_PREFIX}.session_token`
