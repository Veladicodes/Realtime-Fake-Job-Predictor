"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ArrowRight, Flame, Layers3, RefreshCcw, ShieldAlert } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useDashboard } from "@/context/dashboard-context"
import { Skeleton } from "@/components/ui/skeleton"

interface LiveFraudEvent {
  id: string
  timestamp: Date
  message: string
  tone: "critical" | "warning" | "info"
}

function relativeTime(date: Date): string {
  const diff = Math.max(0, Date.now() - date.getTime())
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function scoreStatus(score: number, forceFraud = false): "SAFE" | "FRAUD" {
  if (forceFraud) return "FRAUD"
  return score >= 0.75 ? "FRAUD" : "SAFE"
}

function statusChipClass(status: "SAFE" | "FRAUD"): string {
  return status === "FRAUD"
    ? "border-red/50 text-red"
    : "border-primary/45 text-primary"
}

function metricCellStyle(intensity: number, rgb: string) {
  const normalized = Math.max(0, Math.min(1, intensity))
  const fillAlpha = 0.05 + normalized * 0.18
  const borderAlpha = 0.15 + normalized * 0.25

  return {
    borderColor: `rgba(${rgb}, ${borderAlpha})`,
    background: `linear-gradient(90deg, rgba(${rgb}, ${fillAlpha}) 0%, rgba(2, 2, 2, 0.2) 100%)`,
  }
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function AnimatedScoreFlip({
  eventKey,
  fromScore,
  toScore,
  forceFraud,
}: {
  eventKey: string
  fromScore: number
  toScore: number
  forceFraud: boolean
}) {
  const [displayScore, setDisplayScore] = useState(fromScore)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const durationMs = 950
    const startAt = performance.now()
    let rafId = 0

    const step = (now: number) => {
      const nextProgress = Math.min(1, (now - startAt) / durationMs)
      setProgress(nextProgress)
      setDisplayScore(fromScore + (toScore - fromScore) * nextProgress)

      if (nextProgress < 1) {
        rafId = window.requestAnimationFrame(step)
      }
    }

    rafId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(rafId)
  }, [eventKey, fromScore, toScore])

  const red = Math.round(34 + progress * (239 - 34))
  const green = Math.round(255 + progress * (68 - 255))
  const blue = Math.round(136 + progress * (68 - 136))
  const accent = `rgb(${red}, ${green}, ${blue})`
  const startStatus = scoreStatus(fromScore)
  const endStatus = scoreStatus(toScore, forceFraud)

  return (
    <motion.div
      key={eventKey}
      initial={{ opacity: 0.85, scale: 0.98 }}
      animate={{
        opacity: 1,
        scale: [1, 1.03, 1],
      }}
      transition={{ duration: 0.9, ease: "easeOut" }}
      className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-3"
    >
      <p className="mb-1 text-[11px] font-mono uppercase tracking-[0.13em] text-muted-foreground">Live Score Flip</p>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-primary">{startStatus}</span>
        <ArrowRight className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-xs text-red">{endStatus}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: accent }}>
        {displayScore.toFixed(2)}
      </p>
    </motion.div>
  )
}

function CompactTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-[rgba(5,5,5,0.95)] px-3 py-2">
      {label && <p className="mb-1 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={`${entry.name}-${idx}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color || "#00ff9f" }} />
              {entry.name}
            </span>
            <span className="font-mono font-semibold text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const ScoreCorrectionsPanel = memo(function ScoreCorrectionsPanel() {
  const { corrections, topRiskClusters, correctionSpikes, isLoading } = useDashboard()
  const [highlightedCorrectionId, setHighlightedCorrectionId] = useState<string | null>(null)

  const latestCorrectionRef = useRef("")
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const highlightTimeoutRef = useRef<number | null>(null)

  const correctionRows = useMemo(() => corrections.slice(0, 8), [corrections])
  const featuredCorrection = useMemo(
    () => correctionRows.find((row) => row.correctionType === "UPGRADE_TO_FRAUD") ?? correctionRows[0] ?? null,
    [correctionRows]
  )

  const clusterRows = useMemo(() => topRiskClusters.slice(0, 6), [topRiskClusters])

  const spikeData = useMemo(
    () => correctionSpikes.map((point) => ({ ...point, pressure: point.clusterJobs + point.corrections })),
    [correctionSpikes]
  )

  const heatmapRows = useMemo(() => {
    const maxJobs24h = Math.max(...clusterRows.map((item) => item.jobs24h), 1)

    return clusterRows.map((cluster) => {
      const growthRatio = cluster.jobs6h > 0 ? cluster.jobs1h / cluster.jobs6h : cluster.jobs1h > 0 ? 1 : 0
      const fraudIntensity = Math.max(cluster.peakScore, cluster.correctedJobs / Math.max(cluster.jobs24h, 1))

      return {
        ...cluster,
        sizeIntensity: cluster.jobs24h / maxJobs24h,
        fraudIntensity,
        growthIntensity: Math.min(1, growthRatio * 2),
        growthPercent: Math.round(growthRatio * 100),
      }
    })
  }, [clusterRows])

  const liveEvents = useMemo<LiveFraudEvent[]>(() => {
    const recentRows = corrections.slice(0, 35)
    const events: LiveFraudEvent[] = []

    for (const row of recentRows) {
      const upgraded = row.correctionType === "UPGRADE_TO_FRAUD"
      events.push({
        id: `event-job-${row.jobId}-${row.updatedAt.toISOString()}`,
        timestamp: row.updatedAt,
        message: upgraded
          ? `Job upgraded to FRAUD (${row.clusterId ?? "cluster spike"})`
          : `Risk increase applied for ${row.jobTitle}`,
        tone: upgraded ? "critical" : "warning",
      })
    }

    const clusterSummary = new Map<string, { count: number; latestAt: Date }>()
    for (const row of recentRows) {
      if (!row.clusterId) {
        continue
      }

      const previous = clusterSummary.get(row.clusterId)
      if (!previous) {
        clusterSummary.set(row.clusterId, { count: 1, latestAt: row.updatedAt })
        continue
      }

      clusterSummary.set(row.clusterId, {
        count: previous.count + 1,
        latestAt: previous.latestAt > row.updatedAt ? previous.latestAt : row.updatedAt,
      })
    }

    for (const [clusterId, summary] of clusterSummary.entries()) {
      if (summary.count < 3) {
        continue
      }
      events.push({
        id: `event-cluster-${clusterId}-${summary.latestAt.toISOString()}`,
        timestamp: summary.latestAt,
        message: `${summary.count} jobs corrected in ${clusterId}`,
        tone: "critical",
      })
    }

    const highestRiskCorrection = recentRows.find((row) => row.newScore >= 0.9)
    if (highestRiskCorrection) {
      events.push({
        id: `event-pattern-${highestRiskCorrection.jobId}-${highestRiskCorrection.updatedAt.toISOString()}`,
        timestamp: highestRiskCorrection.updatedAt,
        message: `High-risk pattern detected in ${highestRiskCorrection.clusterId ?? "active cluster"}`,
        tone: "warning",
      })
    }

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 20)
  }, [corrections])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (correctionRows.length === 0) {
      return
    }

    const newest = correctionRows[0]
    const correctionKey = `${newest.jobId}-${newest.updatedAt.toISOString()}`
    if (latestCorrectionRef.current === correctionKey) {
      return
    }

    latestCorrectionRef.current = correctionKey
    const highlightFrame = window.requestAnimationFrame(() => {
      setHighlightedCorrectionId(correctionKey)
    })

    const node = cardRefs.current[correctionKey]
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current)
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedCorrectionId(null)
    }, 7000)

    return () => {
      window.cancelAnimationFrame(highlightFrame)
    }
  }, [correctionRows])

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-[rgba(255,255,255,0.02)] p-5 md:p-6">
      <div className="relative z-10 space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-1.5 text-primary">
              <RefreshCcw className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">Live Fraud Corrections</h2>
              <p className="text-xs text-muted-foreground">Real-time score escalation and fraud flip detection</p>
            </div>
          </div>
          <span className="rounded-full border border-red/45 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-red">
            fraud escalation live
          </span>
        </div>

        <div className="rounded-xl border border-red/45 bg-[rgba(255,255,255,0.02)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red" />
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-red">Live Fraud Corrections</p>
            </div>
            <span className="rounded-full border border-red/45 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] text-red">
              demo critical
            </span>
          </div>

          {isLoading && correctionRows.length === 0 ? (
            <Skeleton className="h-36 w-full rounded-xl bg-muted/25" />
          ) : !featuredCorrection ? (
            <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-4 text-center text-xs text-muted-foreground">
              Waiting for correction events.
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-semibold text-foreground">{featuredCorrection.jobTitle}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ${
                      featuredCorrection.correctionType === "UPGRADE_TO_FRAUD"
                        ? "border-red/50 text-red"
                        : "border-primary/45 text-primary"
                    }`}
                  >
                    {featuredCorrection.correctionType === "UPGRADE_TO_FRAUD" ? "UPGRADE_TO_FRAUD" : "RISK_INCREASE"}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">{relativeTime(featuredCorrection.updatedAt)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[11px] font-mono uppercase tracking-[0.13em] text-primary">Before</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xl font-semibold text-foreground">{Math.round(featuredCorrection.oldScore * 100)}%</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ${statusChipClass(scoreStatus(featuredCorrection.oldScore))}`}
                    >
                      {scoreStatus(featuredCorrection.oldScore)}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-red/45 bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[11px] font-mono uppercase tracking-[0.13em] text-red">After</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xl font-semibold text-foreground">{Math.round(featuredCorrection.newScore * 100)}%</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ${statusChipClass(
                        scoreStatus(featuredCorrection.newScore, featuredCorrection.correctionType === "UPGRADE_TO_FRAUD")
                      )}`}
                    >
                      {scoreStatus(featuredCorrection.newScore, featuredCorrection.correctionType === "UPGRADE_TO_FRAUD")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-red/35 bg-[rgba(255,255,255,0.02)] p-3">
                <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.13em] text-red">Reason</p>
                <div className="space-y-1 text-xs text-foreground/90">
                  {featuredCorrection.reason.split("\n").filter(Boolean).map((line, idx) => (
                    <p key={`${featuredCorrection.jobId}-reason-${idx}`} className="whitespace-pre-wrap">
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              <AnimatedScoreFlip
                eventKey={`${featuredCorrection.jobId}-${featuredCorrection.updatedAt.toISOString()}`}
                fromScore={featuredCorrection.oldScore}
                toScore={featuredCorrection.newScore}
                forceFraud={featuredCorrection.correctionType === "UPGRADE_TO_FRAUD"}
              />
            </motion.div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Recent Corrections</p>
              <span className="text-[11px] text-muted-foreground">latest 8</span>
            </div>

            {isLoading && correctionRows.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={`correction-skeleton-${idx}`} className="h-14 w-full rounded-lg bg-muted/25" />
                ))}
              </div>
            ) : correctionRows.length === 0 ? (
              <div className="rounded-lg border border-border/60 bg-black/25 p-4 text-center text-xs text-muted-foreground">
                No corrections yet.
              </div>
            ) : (
              <div className="space-y-2">
                {correctionRows.map((row) => (
                  <motion.div
                    key={`${row.jobId}-${row.updatedAt.toISOString()}`}
                    ref={(node) => {
                      cardRefs.current[`${row.jobId}-${row.updatedAt.toISOString()}`] = node
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={(() => {
                      const rowKey = `${row.jobId}-${row.updatedAt.toISOString()}`
                      const isHighlighted = highlightedCorrectionId === rowKey
                      const isFraudUpgrade = row.correctionType === "UPGRADE_TO_FRAUD"

                      if (isHighlighted) {
                        return {
                          opacity: 1,
                          y: 0,
                          scale: [1, isFraudUpgrade ? 1.045 : 1.03, 1],
                          x: [0, -4, 4, -2, 0],
                        }
                      }

                      return {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        x: 0,
                      }
                    })()}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className={`rounded-lg border p-3 ${
                      row.correctionType === "UPGRADE_TO_FRAUD"
                        ? "border-red/45 bg-[rgba(255,255,255,0.02)]"
                        : "border-red/25 bg-[rgba(255,255,255,0.02)]"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{row.jobTitle}</p>
                      <span className="shrink-0 text-[11px] font-mono text-muted-foreground">{relativeTime(row.updatedAt)}</span>
                    </div>

                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono uppercase tracking-[0.12em] ${
                          row.correctionType === "UPGRADE_TO_FRAUD"
                            ? "border-red/50 text-red"
                            : "border-primary/45 text-primary"
                        }`}
                      >
                        {row.correctionType}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 font-mono uppercase tracking-[0.12em] ${statusChipClass(scoreStatus(row.oldScore))}`}>
                        {scoreStatus(row.oldScore)}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono uppercase tracking-[0.12em] ${statusChipClass(
                          scoreStatus(row.newScore, row.correctionType === "UPGRADE_TO_FRAUD")
                        )}`}
                      >
                        {scoreStatus(row.newScore, row.correctionType === "UPGRADE_TO_FRAUD")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-border/60 bg-black/35 px-2 py-0.5 font-mono text-muted-foreground">
                        {Math.round(row.oldScore * 100)}%
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      <span className="rounded-full border border-red/50 px-2 py-0.5 font-mono text-red">
                        {Math.round(row.newScore * 100)}%
                      </span>
                      {row.clusterId && (
                        <span className="rounded-full border border-primary/45 px-2 py-0.5 font-mono text-primary">
                          {row.clusterId}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{row.reason}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-primary" />
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Top Risky Clusters</p>
              </div>

              {clusterRows.length === 0 ? (
                <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-4 text-center text-xs text-muted-foreground">
                  No active risky clusters.
                </div>
              ) : (
                <div className="space-y-2">
                  {clusterRows.map((cluster) => (
                    <div key={cluster.clusterId} className="rounded-lg border border-red/35 bg-[rgba(255,255,255,0.02)] p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-mono text-foreground">{cluster.clusterId}</p>
                        <span className="text-[11px] font-mono text-primary">
                          {cluster.pressureScore.toFixed(2)} pressure
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>1h: {cluster.jobs1h}</span>
                        <span>24h: {cluster.jobs24h}</span>
                        <span>Corrections: {cluster.correctedJobs}</span>
                        <span>Intensity: {Math.round(cluster.peakScore * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red" />
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Fraud Spike Graph</p>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={spikeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,165,145,0.2)" />
                    <XAxis dataKey="timestamp" tick={{ fill: "#90a3a0", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#90a3a0", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CompactTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Line type="monotone" dataKey="clusterJobs" name="Cluster Jobs" stroke="#00ffb2" strokeWidth={2.2} dot={false} style={{ filter: "drop-shadow(0 0 4px rgba(0,255,178,0.45))" }} />
                    <Line type="monotone" dataKey="corrections" name="Corrections" stroke="#ef4444" strokeWidth={2} dot={false} style={{ filter: "drop-shadow(0 0 3px rgba(239,68,68,0.3))" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red" />
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Live Fraud Events</p>
              </div>

              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {liveEvents.length === 0 ? (
                    <motion.div
                      key="events-empty"
                      initial={{ opacity: 0.3 }}
                      animate={{ opacity: 1 }}
                      className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-3 text-center text-xs text-muted-foreground"
                    >
                      No live correction events yet.
                    </motion.div>
                  ) : (
                    liveEvents.map((event) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className={`rounded-lg border px-2.5 py-2 text-xs ${
                          event.tone === "critical"
                            ? "border-red/45 bg-[rgba(255,255,255,0.02)]"
                            : event.tone === "warning"
                              ? "border-red/35 bg-[rgba(255,255,255,0.02)]"
                              : "border-border bg-[rgba(255,255,255,0.02)]"
                        }`}
                      >
                        <p className="font-mono text-[11px] text-muted-foreground">[{formatClock(event.timestamp)}]</p>
                        <p className="mt-0.5 text-foreground">{event.message}</p>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Pressure Comparison</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clusterRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="clusterId" tick={{ fill: "#90a3a0", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#90a3a0", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CompactTooltip />} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="jobs24h" name="Jobs 24h" fill="#00ffb2" radius={[5, 5, 0, 0]} />
                <Bar dataKey="correctedJobs" name="Corrections" fill="#ef4444" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-3">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-red" />
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cluster Heatmap</p>
          </div>

          <div className="grid grid-cols-[minmax(0,1.2fr)_1fr_1fr_1fr] gap-2 text-[11px]">
            <div className="rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 py-1 font-mono uppercase tracking-[0.11em] text-muted-foreground">
              Cluster
            </div>
            <div className="rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 py-1 font-mono uppercase tracking-[0.11em] text-muted-foreground">
              Size
            </div>
            <div className="rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 py-1 font-mono uppercase tracking-[0.11em] text-muted-foreground">
              Fraud Intensity
            </div>
            <div className="rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 py-1 font-mono uppercase tracking-[0.11em] text-muted-foreground">
              Time Growth
            </div>

            {heatmapRows.length === 0 ? (
              <div className="col-span-4 rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-3 text-center text-xs text-muted-foreground">
                No cluster heatmap data yet.
              </div>
            ) : (
              heatmapRows.map((cluster) => (
                <div key={cluster.clusterId} className="contents">
                  <div className="truncate rounded-md border border-border bg-[rgba(255,255,255,0.02)] px-2 py-2 font-mono text-[11px] text-foreground">
                    {cluster.clusterId}
                  </div>

                  <div
                    className="rounded-md border px-2 py-2 text-[11px] text-foreground"
                    style={metricCellStyle(cluster.sizeIntensity, "34, 255, 136")}
                    title={`Cluster ${cluster.clusterId}: ${cluster.jobs24h} jobs in 24h, ${cluster.jobs1h} jobs in 1h`}
                  >
                    {cluster.jobs24h} jobs / 24h
                  </div>

                  <div
                    className="rounded-md border px-2 py-2 text-[11px] text-foreground"
                    style={metricCellStyle(cluster.fraudIntensity, "239, 68, 68")}
                    title={`Fraud intensity ${Math.round(cluster.peakScore * 100)}%, corrected ${cluster.correctedJobs}`}
                  >
                    {Math.round(cluster.peakScore * 100)}% peak risk
                  </div>

                  <div
                    className="rounded-md border px-2 py-2 text-[11px] text-foreground"
                    style={metricCellStyle(cluster.growthIntensity, "0, 255, 178")}
                    title={`Time growth ${cluster.growthPercent}% (1h vs 6h baseline)`}
                  >
                    {cluster.growthPercent}% of 6h in 1h
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            Heat intensity maps cluster size, fraud score concentration, and acceleration within the most recent hour.
          </p>
        </div>
      </div>
    </section>
  )
})
