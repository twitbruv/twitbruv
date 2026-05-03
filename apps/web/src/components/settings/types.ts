export type SettingsTab =
  | "profile"
  | "account"
  | "sessions"
  | "privacy"
  | "connections"
  | "experiments"
  | "danger"
  | "dev"

export const SETTINGS_TABS: ReadonlyArray<SettingsTab> = [
  "profile",
  "account",
  "sessions",
  "privacy",
  "connections",
  "experiments",
  "danger",
  ...(import.meta.env.DEV ? (["dev"] as const) : []),
]

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  profile: "Profile",
  account: "Account",
  sessions: "Sessions",
  privacy: "Privacy",
  connections: "Connections",
  experiments: "Experiments",
  danger: "Danger zone",
  dev: "Dev Tools",
}

export function isSettingsTab(value: string): value is SettingsTab {
  return (SETTINGS_TABS as ReadonlyArray<string>).includes(value)
}
