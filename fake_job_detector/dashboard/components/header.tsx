"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Home", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Live Status", href: "#live-status" },
]

export function Header() {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href.startsWith("#")) return false
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-[rgba(0,255,150,0.22)] bg-[linear-gradient(180deg,rgba(0,0,0,0.94),rgba(2,2,2,0.86))]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-white sm:text-base">
              Fake Job Detection System
            </Link>
            <div className="hidden items-center gap-2 rounded-full border border-[rgba(0,255,150,0.45)] bg-[rgba(0,20,10,0.48)] px-2.5 py-1 text-xs font-mono text-[#d4ffe9] shadow-[0_0_24px_rgba(0,255,150,0.25)] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#00ff9f] animate-pulse" />
              <span>System Live</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm border transition-all",
                  isActive(item.href)
                    ? "border-[rgba(0,255,150,0.7)] bg-[rgba(0,22,12,0.7)] text-white shadow-[0_0_24px_rgba(0,255,150,0.28)]"
                    : "border-transparent text-[#9ca3af] hover:border-[rgba(0,255,150,0.45)] hover:text-[#ecffef] hover:bg-[rgba(0,20,10,0.45)]"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,255,150,0.35)] bg-[rgba(2,2,2,0.8)] text-[#ecffef] md:hidden"
            aria-label="Toggle navigation"
            onClick={() => setIsMobileOpen((prev) => !prev)}
          >
            {isMobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </nav>

        {isMobileOpen && (
          <div className="mt-3 border-t border-[rgba(0,255,150,0.22)] pt-3 md:hidden">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm border transition-all",
                    isActive(item.href)
                      ? "border-[rgba(0,255,150,0.7)] bg-[rgba(0,22,12,0.7)] text-white"
                      : "border-transparent text-[#9ca3af]"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(0,255,150,0.45)] bg-[rgba(0,20,10,0.48)] px-2.5 py-1 text-xs font-mono text-[#d4ffe9] shadow-[0_0_24px_rgba(0,255,150,0.25)]">
              <span className="h-2 w-2 rounded-full bg-[#00ff9f] animate-pulse" />
              <span>System Live</span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
