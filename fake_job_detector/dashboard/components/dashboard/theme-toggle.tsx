"use client"

import { useCallback, useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"

const getInitialIsDark = () => {
  if (typeof window === "undefined") {
    return true
  }

  const savedTheme = localStorage.getItem("aether-theme")
  if (savedTheme) {
    return savedTheme === "dark"
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(getInitialIsDark)

  const updateTheme = useCallback((dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add("dark")
      document.documentElement.classList.remove("light")
    } else {
      document.documentElement.classList.remove("dark")
      document.documentElement.classList.add("light")
    }
    localStorage.setItem("aether-theme", dark ? "dark" : "light")
  }, [])

  useEffect(() => {
    updateTheme(isDark)
  }, [isDark, updateTheme])

  const toggleTheme = () => {
    setIsDark((prev) => !prev)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center justify-center w-8 h-8 bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all cursor-pointer"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  )
}
