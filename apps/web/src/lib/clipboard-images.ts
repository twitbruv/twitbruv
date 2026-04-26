export function getPastedImageFiles(
  e: { clipboardData: DataTransfer | null }
): Array<File> {
  const cd = e.clipboardData
  if (!cd) return []
  const out: Array<File> = []
  for (const item of cd.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile()
      if (f) out.push(f)
    }
  }
  if (out.length > 0) return out
  return Array.from(cd.files).filter((f) => f.type.startsWith("image/"))
}
