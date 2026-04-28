export const URL_PATTERN = /https?:\/\/\S+/g

export function trimTrailingPunct(s: string): string {
  return s.replace(/[),.;:!?]+$/, '')
}
