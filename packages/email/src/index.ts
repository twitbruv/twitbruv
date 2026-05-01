import { render } from "@react-email/render"
import { Resend } from "resend"
import { VerifyEmail } from "./templates/verify.tsx"
import { ResetEmail } from "./templates/reset.tsx"
import { MagicLinkEmail } from "./templates/magic-link.tsx"
import { WelcomeEmail } from "./templates/welcome.tsx"

export type TemplateName = "verify" | "reset" | "magic-link" | "welcome"

export interface SendArgs {
  to: string
  subject: string
  template: TemplateName
  data: Record<string, unknown>
}

export interface MailerConfig {
  from: string
  resendApiKey?: string
}

async function renderTemplate(
  template: TemplateName,
  data: Record<string, unknown>
) {
  switch (template) {
    case "verify":
      return render(
        VerifyEmail({
          url: data.url as string,
          name: (data.name as string) || "",
        })
      )
    case "reset":
      return render(
        ResetEmail({
          url: data.url as string,
          name: (data.name as string) || "",
        })
      )
    case "magic-link":
      return render(MagicLinkEmail({ url: data.url as string }))
    case "welcome":
      return render(WelcomeEmail({ handle: data.handle as string }))
  }
}

export function createMailer(config: MailerConfig) {
  return {
    async send(args: SendArgs) {
      const apiKey = config.resendApiKey?.trim()
      if (!apiKey) throw new Error("RESEND_API_KEY required")
      const client = new Resend(apiKey)
      const html = await renderTemplate(args.template, args.data)
      await client.emails.send({
        from: config.from,
        to: args.to,
        subject: args.subject,
        html,
      })
    },
  }
}

export type Mailer = ReturnType<typeof createMailer>
