"use client"

import React, { useState } from "react"

import { Sidebar } from "./sidebar"
import { CommandSearch, useCommandSearch } from "./command-search"
import { NotificationToast } from "./notification-toast"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, Search } from "lucide-react"
import Link from "next/link"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { open, setOpen } = useCommandSearch()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 border-b border-border bg-[rgba(5,5,5,0.96)] lg:hidden">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md border border-border p-2 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center border border-primary/40 bg-[rgba(255,255,255,0.02)]">
                <span className="font-mono text-xs font-bold text-primary">AI</span>
              </div>
              <span className="font-semibold tracking-wide text-foreground">FRAUD COMMAND</span>
            </Link>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-md border border-border p-2 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </header>

      <Sidebar onOpenCommand={() => setOpen(true)} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <CommandSearch open={open} onOpenChange={setOpen} />

      <main className="lg:pl-64 pt-14 lg:pt-0">
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <NotificationToast />
    </div>
  )
}
