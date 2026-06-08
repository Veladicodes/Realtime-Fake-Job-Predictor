"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import { useTheme } from "next-themes"
import { Palette } from "lucide-react"
import { cn } from "@/lib/utils"
import { themes, type ThemeColor } from "@/lib/themes"

const STORAGE_KEY = "color-theme"

const getInitialTheme = (): ThemeColor => {
  if (typeof window === "undefined") return "matrix"

  const savedTheme = localStorage.getItem(STORAGE_KEY) as ThemeColor | null
  if (savedTheme === "matrix") return savedTheme

  return "matrix"
}

export function ThemeChanger() {
  const [currentTheme, setCurrentTheme] = useState<ThemeColor>(getInitialTheme)
  const [isOpen, setIsOpen] = useState(false)
  const { resolvedTheme, systemTheme } = useTheme()
  const currentThemeRef = useRef<ThemeColor>("matrix")
  const availableThemes: ThemeColor[] = ["matrix"]

  const applyTheme = useCallback(
    (themeName: ThemeColor, mode?: string | null) => {
      const themeConfig = themes[themeName]
      // Use resolvedTheme or fallback to systemTheme, default to "light"
      const effectiveMode = mode ?? systemTheme ?? "light"
      const isDark = effectiveMode === "dark"
      const colors = isDark ? themeConfig.dark : themeConfig.light

      // Use double requestAnimationFrame to ensure DOM is updated after dark class change
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Object.entries(colors).forEach(([key, value]) => {
            document.documentElement.style.setProperty(`--${key}`, value)
          })
        })
      })
    },
    [systemTheme]
  )

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue !== "matrix") {
        return
      }

      currentThemeRef.current = e.newValue as ThemeColor
      setCurrentTheme(e.newValue as ThemeColor)
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  useEffect(() => {
    currentThemeRef.current = currentTheme
  }, [currentTheme])

  useEffect(() => {
    if (resolvedTheme === undefined) return

    applyTheme(currentTheme, resolvedTheme)
  }, [currentTheme, resolvedTheme, applyTheme])

  const handleThemeChange = (themeName: ThemeColor) => {
    // Update ref first to ensure persistence
    currentThemeRef.current = themeName
    // Update state for re-render
    setCurrentTheme(themeName)
    // Persist to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, themeName)
    }
    // Apply theme immediately with current mode
    const effectiveMode = resolvedTheme ?? systemTheme ?? "light"
    applyTheme(themeName, effectiveMode)
    setIsOpen(false)
  }

  const themeColors: Partial<Record<ThemeColor, string>> = {
    matrix: "bg-gradient-to-br from-primary to-primary/60",
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "group relative flex h-9 w-9 items-center justify-center rounded-lg",
          "text-muted-foreground transition-all duration-300",
          "hover:text-primary hover:bg-primary/10",
          isOpen && "bg-primary/10 text-primary",
        )}
        aria-label="Change color theme"
      >
        <Palette className="h-4 w-4" />
        <span
          className={cn(
            "absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap",
            "rounded-md bg-card border border-border px-2.5 py-1",
            "font-mono text-[10px] text-muted-foreground",
            "opacity-0 transition-all duration-200 pointer-events-none shadow-lg",
            "group-hover:opacity-100 group-hover:-bottom-9",
          )}
        >
          Colors
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className={cn(
              "absolute right-0 top-12 z-50",
              "w-48 rounded-lg border border-border",
              "bg-card/95 shadow-xl",
              "p-3 animate-fade-in",
            )}
          >
            <div className="mb-2 font-mono text-xs text-muted-foreground uppercase tracking-wider">Select Theme</div>
            <div className="space-y-1.5">
              {availableThemes.map((key) => {
                const theme = themes[key]
                return (
                <button
                  key={key}
                  onClick={() => handleThemeChange(key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
                    "transition-all duration-200",
                    "hover:bg-secondary/80",
                    currentTheme === key ? "bg-primary/10 border border-primary/50" : "border border-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full border-2 border-border shadow-sm",
                      themeColors[key] ?? "bg-primary",
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-sm flex-1 text-left",
                      currentTheme === key ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    {theme.name}
                  </span>
                  {currentTheme === key && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
