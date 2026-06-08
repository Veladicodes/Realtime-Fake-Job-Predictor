"use client"

import { memo, useMemo } from "react"
import { Activity, Database, ShieldCheck, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/context/dashboard-context"

type ServiceState = "active" | "warning" | "down"

function MiniActivityGraph({ values, colorClass }: { values: number[]; colorClass: string }) {
  return (
    <div className="flex h-6 items-end gap-1">
      {values.map((value, index) => (
        <span
          key={`mini-${index}`}
          className={cn("w-1.5 rounded-sm", colorClass)}
          style={{ height: `${value}px`, opacity: 0.45 + index * 0.06 }}
        />
      ))}
    </div>
  )
}

function serviceStateBadge(state: ServiceState) {
  if (state === "active") {
    return {
      label: "ACTIVE",
      dotClass: "bg-primary animate-pulse",
      textClass: "text-primary",
      graphClass: "bg-primary/80",
    }
  }

  if (state === "warning") {
    return {
      label: "WARNING",
      dotClass: "bg-red animate-pulse",
      textClass: "text-red",
      graphClass: "bg-red/70",
    }
  }

  return {
    label: "DOWN",
    dotClass: "bg-red animate-pulse",
    textClass: "text-red",
    graphClass: "bg-red/80",
  }
}

export const SystemLoadPanel = memo(function SystemLoadPanel({ className }: { className?: string }) {
  const { systemLoad, throughputHistory, latencyHistory, isLoading } = useDashboard()

  const throughputPercent = (systemLoad.currentThroughput / Math.max(systemLoad.peakThroughput, 1)) * 100
  const latencyPercent = Math.min((systemLoad.processingLatency / 150) * 100, 100)

  const throughputGraph = useMemo(() => {
    const source = throughputHistory.length > 0 ? throughputHistory : [systemLoad.currentThroughput]
    const maxValue = Math.max(...source, 1)
    return source.slice(-8).map((value) => Math.max(3, Math.round((value / maxValue) * 16)))
  }, [systemLoad.currentThroughput, throughputHistory])

  const latencyGraph = useMemo(() => {
    const source = latencyHistory.length > 0 ? latencyHistory : [systemLoad.processingLatency]
    return source.slice(-8).map((value) => Math.max(3, Math.min(16, Math.round((value / 150) * 16))))
  }, [latencyHistory, systemLoad.processingLatency])

  return (
    <section className={cn("rounded-2xl border border-border bg-[rgba(255,255,255,0.02)] p-5", className)}>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-1.5 text-primary">
              <Activity className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold tracking-[0.12em] text-foreground">SYSTEM LOAD</h2>
          </div>
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-primary">
            live
          </span>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Current Throughput</p>
              <span className="font-mono text-sm font-semibold text-primary">
                {systemLoad.currentThroughput.toFixed(0)} jobs/s
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(throughputPercent, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Peak {systemLoad.peakThroughput.toFixed(0)} jobs/s</span>
              {isLoading && throughputHistory.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">syncing...</span>
              ) : (
                <MiniActivityGraph values={throughputGraph} colorClass="bg-primary" />
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Processing Latency</p>
              <span
                className={cn(
                  "font-mono text-sm font-semibold",
                  systemLoad.processingLatency < 85 ? "text-primary" : "text-red"
                )}
              >
                {systemLoad.processingLatency.toFixed(0)}ms
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  systemLoad.processingLatency < 85
                    ? "bg-primary"
                    : "bg-red"
                )}
                style={{ width: `${latencyPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Target &lt; 100ms</span>
              {isLoading && latencyHistory.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">syncing...</span>
              ) : (
                <MiniActivityGraph
                  values={latencyGraph}
                  colorClass={systemLoad.processingLatency < 85 ? "bg-primary" : "bg-red"}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
})

export const SystemIntelligencePanel = memo(function SystemIntelligencePanel({ className }: { className?: string }) {
  const { systemIntelligence, systemStatus, systemLoad, serviceHistory } = useDashboard()

  const mapHistory = (series: number[]) =>
    (series.length > 0 ? series : [0]).slice(-8).map((value) => Math.max(3, Math.round(value * 13)))

  const kafkaActive = systemStatus.kafka === "running"
  const sparkActive = systemStatus.spark === "active"
  const databaseActive = systemStatus.database === "connected"
  const mlActive = systemStatus.ml === "loaded"

  const services: Array<{
    key: string
    label: string
    state: ServiceState
    throughput: string
    graph: number[]
  }> = [
    {
      key: "kafka",
      label: "Kafka Layer",
      state: kafkaActive ? "active" : "down",
      throughput: kafkaActive ? "Broker reachable" : "Ingress unavailable",
      graph: mapHistory(serviceHistory.kafka),
    },
    {
      key: "spark",
      label: "Spark Stream",
      state:
        sparkActive
          ? systemLoad.processingLatency > 85
            ? "warning"
            : "active"
          : systemStatus.spark === "idle"
            ? "warning"
            : "down",
      throughput:
        systemStatus.spark === "active"
          ? `${systemLoad.currentThroughput.toFixed(0)} jobs/s`
          : systemStatus.spark === "idle"
            ? "Buffering"
            : "Down",
      graph: mapHistory(serviceHistory.spark),
    },
    {
      key: "database",
      label: "PostgreSQL",
      state: databaseActive ? "active" : "down",
      throughput: databaseActive ? "Connected" : "Disconnected",
      graph: mapHistory(serviceHistory.database),
    },
    {
      key: "model",
      label: "ML Engine",
      state: mlActive ? "active" : "down",
      throughput:
        systemStatus.ml === "loaded"
          ? `${systemIntelligence.modelConfidence.toFixed(1)}% conf`
          : "Model unavailable",
      graph: mapHistory(serviceHistory.ml),
    },
  ]

  return (
    <section className={cn("rounded-2xl border border-border bg-[rgba(255,255,255,0.02)] p-5", className)}>
      <div>
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-1.5 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold tracking-[0.12em] text-foreground">SYSTEM INTELLIGENCE</h2>
        </div>

        <div className="mb-4 space-y-2 rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-3">
          <div className="flex items-start justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Highest Fraud Category</span>
            <span className="font-mono text-foreground">{systemIntelligence.highestFraudCategory}</span>
          </div>
          <div className="flex items-start justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Common Reason</span>
            <span className="font-mono text-foreground">{systemIntelligence.commonFraudReason}</span>
          </div>
          <div className="flex items-start justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Keyword Spike</span>
            <span className="font-mono text-primary">{systemIntelligence.suspiciousKeywordSpike}</span>
          </div>
        </div>

        <div className="space-y-2">
          {services.map((service) => {
            const badge = serviceStateBadge(service.state)
            return (
              <div
                key={service.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-[rgba(255,255,255,0.02)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", badge.dotClass)} />
                    <p className="truncate text-xs font-semibold text-foreground">{service.label}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-muted-foreground">{service.throughput}</p>
                </div>

                <div className="flex items-center gap-2">
                  <MiniActivityGraph values={service.graph} colorClass={badge.graphClass} />
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em]",
                      badge.textClass,
                      service.state === "active"
                        ? "border-primary/40"
                        : service.state === "warning"
                          ? "border-red/35"
                          : "border-red/45"
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-[rgba(255,255,255,0.02)] px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 text-primary">
            <Database className="h-3.5 w-3.5" />
            Model confidence {systemIntelligence.modelConfidence.toFixed(1)}%
          </span>
          <span className="mx-2 text-border">|</span>
          <span className="inline-flex items-center gap-1">
            <TriangleAlert className="h-3.5 w-3.5 text-red" />
            Automated anomaly routing enabled
          </span>
        </div>
      </div>
    </section>
  )
})
