import { createFileRoute } from "@tanstack/react-router"
// Side-effect import: loads the server-route type augmentation
// (`server?` on FilebaseRouteOptionsInterface) so TS knows about the
// `server.handlers` shape on createFileRoute().
import "@tanstack/react-start"
import { ImageResponse } from "@vercel/og"
import { APP_NAME } from "../lib/env"
import { OG_HEADERS, OG_SIZE, OgFrame, getOgFonts } from "../lib/og-image"

const TAGLINE = "Open. Free. No AI ranking, no paywalls, no ads."

export const Route = createFileRoute("/og")({
  server: {
    handlers: {
      GET: async () => {
        const fonts = await getOgFonts()
        return new ImageResponse(
          <OgFrame eyebrow={APP_NAME} seed={APP_NAME}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                justifyContent: "center",
                gap: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 130,
                  fontWeight: 800,
                  letterSpacing: -4,
                  lineHeight: 1,
                }}
              >
                {APP_NAME}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 38,
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.78)",
                  letterSpacing: -0.5,
                }}
              >
                {TAGLINE}
              </div>
            </div>
          </OgFrame>,
          { ...OG_SIZE, fonts, headers: OG_HEADERS }
        )
      },
    },
  },
})
