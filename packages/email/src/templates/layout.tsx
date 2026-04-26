import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components'
import type { ReactNode } from 'react'

export function Layout({
  preview,
  children,
  appName = 'twotter',
}: {
  preview: string
  children: ReactNode
  appName?: string
}) {
  return (
  <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: '#fff', padding: '32px 0' }}>
        <Container style={{ maxWidth: 560, margin: '0 auto' }}>
          <Section>
            <Text style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{appName}</Text>
          </Section>
          {children}
          <Section style={{ marginTop: 32, borderTop: '1px solid #eee', paddingTop: 16 }}>
            <Text style={{ fontSize: 12, color: '#888' }}>
              You're receiving this because an action was initiated on your {appName} account. If
              that wasn't you, you can safely ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
