import { useHotkey } from "@tanstack/react-hotkeys"
import type { RefObject } from "react"

/**
 * Hook to enable cmd/ctrl+enter submission on forms
 * @param onSubmit - Function to call when hotkey is pressed
 * @param options - Optional settings
 */
export function useSubmitHotkey(
  onSubmit: () => void,
  options: {
    enabled?: boolean
    target?: RefObject<HTMLElement | null>
  } = {}
) {
  const { enabled = true, target } = options

  useHotkey(
    "Mod+Enter",
    (e) => {
      e.preventDefault()
      onSubmit()
    },
    { enabled, target }
  )
}
