"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  AlertCircle,
  TrendingUp,
  Microscope,
  Monitor,
  FileText,
  Search,
  X,
} from "lucide-react"

const pages = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Fraud Alerts", href: "/alerts", icon: AlertCircle },
  { name: "Trends Analysis", href: "/trends", icon: TrendingUp },
  { name: "Deep Investigation", href: "/investigation", icon: Microscope },
  { name: "System Monitor", href: "/system-monitor", icon: Monitor },
]

const quickActions = [
  { name: "View Latest Alerts", action: "latest-alerts", icon: AlertCircle },
  { name: "System Status", action: "system-status", icon: Monitor },
  { name: "Export Fraud Report", action: "export-report", icon: FileText },
]

interface CommandSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")

  const handleSelect = useCallback(
    (href: string) => {
      onOpenChange(false)
      setQuery("")
      router.push(href)
    },
    [router, onOpenChange]
  )

  const filteredPages = pages.filter(page =>
    page.name.toLowerCase().includes(query.toLowerCase())
  )

  const filteredActions = quickActions.filter(action =>
    action.name.toLowerCase().includes(query.toLowerCase())
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => {
          onOpenChange(false)
          setQuery("")
        }}
      />

      {/* Dialog */}
      <div className="relative mx-4 w-full max-w-2xl overflow-hidden border border-border bg-[rgba(5,5,5,0.98)]">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search pages and actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground"
          />
          <button
            onClick={() => {
              onOpenChange(false)
              setQuery("")
            }}
            className="p-1 hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {filteredPages.length === 0 && filteredActions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No results found.
            </div>
          ) : (
            <>
              {filteredPages.length > 0 && (
                <div className="border-b border-border">
                  <div className="bg-[rgba(255,255,255,0.02)] px-4 py-2 text-xs font-semibold text-muted-foreground">
                    Pages
                  </div>
                  {filteredPages.map((page) => (
                    <button
                      key={page.href}
                      onClick={() => handleSelect(page.href)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    >
                      <page.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground">{page.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {filteredActions.length > 0 && (
                <div>
                  <div className="bg-[rgba(255,255,255,0.02)] px-4 py-2 text-xs font-semibold text-muted-foreground">
                    Quick Actions
                  </div>
                  {filteredActions.map((action) => (
                    <button
                      key={action.action}
                      onClick={() => {
                        onOpenChange(false)
                        setQuery("")
                      }}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    >
                      <action.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground">{action.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function useCommandSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return { open, setOpen }
}
