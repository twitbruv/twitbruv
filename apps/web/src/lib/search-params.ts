export function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value
  if (typeof value === "string" && !Number.isNaN(Number(value)))
    return Number(value)
  return undefined
}
