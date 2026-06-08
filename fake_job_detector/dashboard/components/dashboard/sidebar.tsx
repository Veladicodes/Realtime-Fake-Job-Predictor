"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  AlertCircle,
  TrendingUp,
  Search,
  Microscope,
  Monitor,
  Settings,
  Command,
  X,
} from "lucide-react"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview" },
  { href: "/alerts", label: "Alerts", icon: AlertCircle, description: "Fraud Alerts" },
  { href: "/trends", label: "Trends", icon: TrendingUp, description: "Analytics" },
  { href: "/investigation", label: "Investigation", icon: Microscope, description: "Deep Dive" },
  { href: "/system-monitor", label: "System Monitor", icon: Monitor, description: "Status" },
]

interface SidebarProps {
  onOpenCommand?: () => void
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ onOpenCommand, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      <aside className={cn(
        "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-[rgba(5,5,5,0.98)] transition-transform duration-300",
        "lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(0,255,178,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,178,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />

      {/* Logo & Theme Toggle */}
      <div className="relative z-10 border-b border-border/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <Link href="/dashboard" className="flex items-center gap-3 group" onClick={onClose}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-[rgba(255,255,255,0.02)]">
              <span className="font-mono text-sm font-bold text-primary">AI</span>
            </div>
            <div>
              <span className="text-lg font-semibold tracking-tight text-foreground">FRAUD DETECT</span>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Command Center</p>
            </div>
          </Link>
          <button 
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Trigger */}
      <div className="relative z-10 p-4">
        <button
          onClick={onOpenCommand}
          className="flex w-full items-center gap-3 rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-3 py-2 text-sm text-muted-foreground transition-transform duration-200 hover:translate-x-1 hover:border-primary/40 hover:text-foreground"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="flex items-center gap-1 text-xs font-mono bg-background px-1.5 py-0.5 border border-border">
            <Command className="w-3 h-3" />K
          </kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-transform duration-200",
                isActive
                  ? "border-primary/45 bg-[rgba(255,255,255,0.03)] text-foreground shadow-[0_0_0_1px_rgba(0,255,178,0.16)]"
                  : "border-transparent text-muted-foreground hover:translate-x-1 hover:border-primary/35 hover:bg-[rgba(255,255,255,0.02)] hover:text-foreground"
              )}
            >
              {isActive && (
                <>
                  <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-primary" />
                  <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/80" />
                </>
              )}
              <item.icon
                className={cn(
                  "h-4 w-4 transition-transform duration-200 group-hover:scale-105",
                  isActive ? "text-primary" : ""
                )}
              />
              <span className="font-medium">{item.label}</span>
              <span className="ml-auto text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {item.description}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="relative z-10 border-t border-border/60 p-4">
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-all hover:translate-x-1 hover:bg-[rgba(14,20,18,0.85)] hover:text-foreground"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </Link>

        {/* System Status Indicator */}
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-3 py-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">System Active</p>
            <p className="text-xs text-muted-foreground truncate">Real-time monitoring</p>
          </div>
        </div>
      </div>
    </aside>
    </>
  )
}
