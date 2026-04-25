import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import type { ReactNode } from "react"

export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "app.theme"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (next: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemPrefersDark() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyThemeClass(resolved: "light" | "dark") {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (resolved === "dark") root.classList.add("dark")
  else root.classList.remove("dark")
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system"
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system"
  })
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const resolved =
      theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme
    setResolvedTheme(resolved)
    applyThemeClass(resolved)

    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const r = mq.matches ? "dark" : "light"
      setResolvedTheme(r)
      applyThemeClass(r)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>")
  return ctx
}

/**
 * Inline script string to drop into the <head> before React hydrates. Reads the user's
 * stored preference (or falls back to system) and applies the `dark` class synchronously so
 * there's no flash of the wrong theme.
 */
export const themeBootstrapScript = `
(function(){try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var t=s||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();
`.trim()
