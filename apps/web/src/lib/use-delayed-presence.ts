import { useEffect, useState } from "react"

export function useDelayedPresence<T>(value: T | null, delayMs: number) {
  const [delayedValue, setDelayedValue] = useState(value)

  useEffect(() => {
    if (value !== null) {
      setDelayedValue(value)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setDelayedValue(null)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [delayMs, value])

  return value ?? delayedValue
}
