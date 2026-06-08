"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Filter, Flame, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard, type FraudAlert } from "@/context/dashboard-context"
import { Skeleton } from "@/components/ui/skeleton"

type RiskFilter = "all" | "critical" | "warning" | "info"
type TimeFilter = "all" | "5m" | "15m" | "1h"
type SortBy = "risk-desc" | "risk-asc" | "newest"

const ALERT_ROW_HEIGHT = 150

interface FraudAlertsPanelProps {
  alerts?: FraudAlert[]
}

function getAlertCategory(reason: string): string {
  const value = reason.toLowerCase()
  if (value.includes("domain")) return "domain"
  if (value.includes("duplicate")) return "duplicate"
  if (value.includes("salary")) return "salary"
  if (value.includes("urgency") || value.includes("pattern")) return "pattern"
  if (value.includes("keyword")) return "keyword"
  return "other"
}

function getSeverity(alert: FraudAlert): "critical" | "warning" | "info" {
  if (alert.confidence >= 0.9 || alert.level === "critical") return "critical"
  if (alert.confidence >= 0.7 || alert.level === "warning") return "warning"
  return "info"
}

function formatRelativeTime(timestamp: Date, nowTs: number): string {
  if (nowTs === 0) return "syncing..."

  const diff = Math.max(0, nowTs - timestamp.getTime())
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

export function FraudAlertsPanel({ alerts: propAlerts }: FraudAlertsPanelProps) {
  const { alerts: contextAlerts, isLoading, error, isRunning } = useDashboard()
  const alerts = propAlerts || contextAlerts

  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all")
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("15m")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<SortBy>("risk-desc")
  const [nowTs, setNowTs] = useState<number>(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(620)
  const listRef = useRef<HTMLDivElement | null>(null)
  const initializedAlertIdsRef = useRef<Set<string>>(new Set())
  const pulseTimeoutsRef = useRef<Record<string, number>>({})
  const [pulsingAlertIds, setPulsingAlertIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowTs(Date.now())
    }, 3000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const node = listRef.current
    if (!node) {
      return
    }

    const handleResize = () => {
      setViewportHeight(node.clientHeight)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    if (alerts.length === 0) {
      return
    }

    if (initializedAlertIdsRef.current.size === 0) {
      alerts.forEach((alert) => initializedAlertIdsRef.current.add(alert.id))
      return
    }

    alerts.forEach((alert) => {
      if (initializedAlertIdsRef.current.has(alert.id)) {
        return
      }

      initializedAlertIdsRef.current.add(alert.id)
      setPulsingAlertIds((prev) => ({ ...prev, [alert.id]: true }))

      pulseTimeoutsRef.current[alert.id] = window.setTimeout(() => {
        setPulsingAlertIds((prev) => {
          if (!prev[alert.id]) {
            return prev
          }

          const next = { ...prev }
          delete next[alert.id]
          return next
        })
        delete pulseTimeoutsRef.current[alert.id]
      }, 2600)
    })
  }, [alerts])

  useEffect(() => {
    return () => {
      Object.values(pulseTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
    }
  }, [])

  const categories = useMemo(
    () => Array.from(new Set(alerts.map((alert) => getAlertCategory(alert.reason)))),
    [alerts]
  )

  const filteredAlerts = useMemo(() => {
    const filtered = alerts.filter((alert) => {
      const severity = getSeverity(alert)
      const category = getAlertCategory(alert.reason)
      const ageMs = nowTs === 0 ? 0 : nowTs - alert.timestamp.getTime()

      const riskMatch = riskFilter === "all" || severity === riskFilter
      const categoryMatch = categoryFilter === "all" || category === categoryFilter

      let timeMatch = true
      if (timeFilter === "5m") timeMatch = ageMs <= 5 * 60 * 1000
      if (timeFilter === "15m") timeMatch = ageMs <= 15 * 60 * 1000
      if (timeFilter === "1h") timeMatch = ageMs <= 60 * 60 * 1000

      return riskMatch && categoryMatch && timeMatch
    })

    if (sortBy === "risk-desc") {
      return filtered.sort((a, b) => b.confidence - a.confidence)
    }

    if (sortBy === "risk-asc") {
      return filtered.sort((a, b) => a.confidence - b.confidence)
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }, [alerts, categoryFilter, nowTs, riskFilter, sortBy, timeFilter])

  const virtualizedAlerts = useMemo(() => {
    const overscan = 3
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / ALERT_ROW_HEIGHT))
    const startIndex = Math.max(0, Math.floor(scrollTop / ALERT_ROW_HEIGHT) - overscan)
    const endIndex = Math.min(filteredAlerts.length, startIndex + visibleCount + overscan * 2)

    return {
      startIndex,
      endIndex,
      paddingTop: startIndex * ALERT_ROW_HEIGHT,
      paddingBottom: Math.max(0, (filteredAlerts.length - endIndex) * ALERT_ROW_HEIGHT),
      items: filteredAlerts.slice(startIndex, endIndex),
    }
  }, [filteredAlerts, scrollTop, viewportHeight])

  const criticalCount = filteredAlerts.filter((alert) => getSeverity(alert) === "critical").length

  return (
    <section className="tier-hero relative overflow-hidden rounded-2xl border border-border bg-[rgba(255,255,255,0.02)]">
      <div className="relative z-10 border-b border-border px-4 py-4 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-[rgba(255,255,255,0.02)] text-primary">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-[0.08em] text-foreground">LIVE FRAUD ALERT MATRIX</h2>
              <p className="text-xs text-muted-foreground">Risk-prioritized stream with live triage filters</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="rounded-full border border-red/45 px-2 py-1 text-red">{criticalCount} critical</span>
            <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{filteredAlerts.length} shown</span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_130px_150px_140px]">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Risk:
            </div>
            {(["all", "critical", "warning", "info"] as RiskFilter[]).map((risk) => (
              <button
                key={risk}
                type="button"
                onClick={() => setRiskFilter(risk)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] transition-all",
                  riskFilter === risk
                    ? risk === "critical"
                      ? "border-red/60 text-red"
                      : risk === "warning"
                        ? "border-red/45 text-red"
                        : risk === "info"
                          ? "border-primary/60 text-primary"
                          : "border-primary/60 text-primary"
                    : "border-border bg-[rgba(255,255,255,0.01)] text-muted-foreground hover:border-primary/30"
                )}
              >
                {risk}
              </button>
            ))}
          </div>

          <select
            value={timeFilter}
            onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
            className="h-8 rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 text-xs text-muted-foreground outline-none focus:border-primary"
          >
            <option value="all">All Time</option>
            <option value="5m">Last 5m</option>
            <option value="15m">Last 15m</option>
            <option value="1h">Last 1h</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-8 rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 text-xs text-muted-foreground outline-none focus:border-primary"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortBy)}
            className="h-8 rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 text-xs text-muted-foreground outline-none focus:border-primary"
          >
            <option value="risk-desc">Risk High-Low</option>
            <option value="risk-asc">Risk Low-High</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="relative z-10 max-h-[620px] space-y-2 overflow-y-auto p-3 md:p-4"
      >
        {isLoading && filteredAlerts.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={`alert-skeleton-${index}`} className="h-20 w-full rounded-xl bg-muted/25" />
            ))}
          </div>
        ) : error && filteredAlerts.length === 0 ? (
          <div className="rounded-xl border border-red/45 bg-[rgba(255,255,255,0.02)] p-6 text-center text-sm text-red">
            {error}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-6 text-center text-sm text-muted-foreground">
            {isRunning ? "No alerts match the selected filters." : "No alerts yet. Waiting for live pipeline data."}
          </div>
        ) : (
          <>
            {virtualizedAlerts.paddingTop > 0 && <div style={{ height: `${virtualizedAlerts.paddingTop}px` }} />}
            {virtualizedAlerts.items.map((alert, localIndex) => {
            const index = virtualizedAlerts.startIndex + localIndex
            const severity = getSeverity(alert)
            const isCritical = severity === "critical"
            const isWarning = severity === "warning"
            const isCorrected = alert.isCorrected
            const isFresh = nowTs > 0 && nowTs - alert.timestamp.getTime() <= 90 * 1000
            const isPulsing = Boolean(pulsingAlertIds[alert.id])
            const category = getAlertCategory(alert.reason)

            return (
              <motion.article
                key={alert.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className={cn(
                  "group relative min-h-[140px] overflow-hidden rounded-xl border bg-[rgba(255,255,255,0.02)] p-3 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/45",
                  isCritical && "border-red/40 border-l-[3px] border-l-[#ff3b3b] bg-[rgba(255,59,59,0.03)]",
                  isWarning && "border-red/30 border-l-[3px] border-l-[#ff3b3b] bg-[rgba(255,59,59,0.02)]",
                  severity === "info" && "border-border",
                  isCorrected && "border-red/55",
                  isPulsing && "alert-pulse-red"
                )}
              >
                {isFresh && (
                  <span className="pointer-events-none absolute inset-0 border border-primary/20" />
                )}

                <div className="relative z-10 pl-2.5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{alert.jobTitle}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.reason}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {isCorrected && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-red">
                          UPDATED FRAUD DETECTION
                        </span>
                      )}

                      {isCritical && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-red">
                          <Flame className="h-3 w-3" />
                          CRITICAL
                        </span>
                      )}

                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold",
                          isCritical
                            ? "border-red/50 text-red"
                            : isWarning
                              ? "border-red/35 text-red"
                              : "border-primary/45 text-primary"
                        )}
                      >
                        {(alert.confidence * 100).toFixed(0)}% risk
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-border px-1.5 py-0.5 font-mono uppercase tracking-wide">
                        {category}
                      </span>
                      {alert.clusterId && (
                        <span className="rounded border border-primary/45 px-1.5 py-0.5 font-mono uppercase tracking-wide text-primary">
                          {alert.clusterId}
                        </span>
                      )}
                      {isFresh && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          new
                        </span>
                      )}
                    </div>
                    <span className="font-mono">{formatRelativeTime(alert.timestamp, nowTs)}</span>
                  </div>
                </div>
              </motion.article>
            )
          })}
            {virtualizedAlerts.paddingBottom > 0 && <div style={{ height: `${virtualizedAlerts.paddingBottom}px` }} />}
          </>
        )}
      </div>
    </section>
  )
}
