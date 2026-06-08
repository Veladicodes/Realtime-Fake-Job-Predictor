"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import { Activity, AlertTriangle, Gauge, RefreshCw } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { FraudAlertsPanel } from "@/components/dashboard/fraud-alerts-panel"
import { GlanceCard } from "@/components/dashboard/glance-card"
import { LiveIndicator } from "@/components/dashboard/live-indicator"
import { PipelineVisual } from "@/components/dashboard/pipeline-visual"
import { ScoreCorrectionsPanel } from "@/components/dashboard/score-corrections-panel"
import { SystemIntelligencePanel, SystemLoadPanel } from "@/components/dashboard/system-panels"
import { Button } from "@/components/ui/button"
import { useDashboard } from "@/context/dashboard-context"

function metricDelta(values: number[]): number {
  if (values.length < 2) {
    return 0
  }

  const prev = Math.max(1, values[values.length - 2])
  const current = values[values.length - 1]
  return Number((((current - prev) / prev) * 100).toFixed(1))
}

function NeonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-border bg-[rgba(5,5,5,0.96)] px-3 py-2">
      {label && <p className="mb-1 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={`${entry.name}-${idx}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color || "#00ffb2" }} />
              {entry.name}
            </span>
            <span className="font-mono font-semibold text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DashboardPageInner() {
  const {
    totalJobs,
    fakeJobs,
    realJobs,
    fakePercentage,
    highPressureClusters,
    trends,
    refreshMetrics,
    isRefreshing,
    isLoading,
    error,
    systemStatus,
    systemMetrics,
    systemPhase,
  } = useDashboard()

  const displayedFraudRate = systemMetrics.samples > 0 ? systemMetrics.fraud_rate * 100 : fakePercentage
  const anomalyPercent = systemMetrics.anomaly_rate * 100

  const chartData = useMemo(
    () =>
      trends.map((item) => ({
        timestamp: item.timestamp,
        totalJobs: item.totalJobs,
        fakeJobs: item.fakeJobs,
        realJobs: item.realJobs,
        throughput: Number(item.throughput.toFixed(2)),
      })),
    [trends]
  )

  const totalSeries = useMemo(() => chartData.map((item) => item.totalJobs), [chartData])
  const fakeSeries = useMemo(() => chartData.map((item) => item.fakeJobs), [chartData])
  const pipelineStep = useMemo(() => {
    if (systemStatus.database !== "connected") {
      return 0
    }
    if (systemStatus.spark === "down") {
      return 1
    }
    if (systemStatus.ml !== "loaded") {
      return 2
    }
    return 3
  }, [systemStatus])

  const phaseLabel =
    systemStatus.mode === "degraded"
      ? systemStatus.messages[0] ?? "Degraded mode active"
      : systemStatus.mode === "recovery"
        ? systemStatus.messages[0] ?? "Recovery mode in progress"
        : systemPhase === "fraud_detected"
      ? "Fraud pattern escalation in progress"
      : systemPhase === "cluster_forming"
        ? "Cluster pressure observed"
        : systemPhase === "analyzing"
          ? "Pipeline actively analyzing incoming jobs"
          : "System standing by for new events"

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LiveIndicator />
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Fraud Detection Command</h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">{phaseLabel}</p>
        </div>

        <Button
          onClick={() => void refreshMetrics()}
          disabled={isRefreshing}
          className="w-full md:w-auto"
          variant="outline"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh Data
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red/45 bg-red/10 px-4 py-3 text-sm text-red">
          {error}
        </div>
      )}

      {systemStatus.mode !== "normal" && (
        <div className="mb-6 rounded-xl border border-amber-400/45 bg-amber-300/10 px-4 py-3 text-sm text-amber-200">
          {systemStatus.messages.length > 0
            ? systemStatus.messages.join(" | ")
            : "System operating in degraded mode while dependencies recover."}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlanceCard
          title="Total Jobs"
          value={totalJobs}
          change={metricDelta(totalSeries)}
          sparklineData={totalSeries}
          icon={Activity}
          subtitle="Ingested and processed"
        />
        <GlanceCard
          title="Flagged Fake"
          value={fakeJobs}
          change={metricDelta(fakeSeries)}
          sparklineData={fakeSeries}
          icon={AlertTriangle}
          variant="danger"
          subtitle="High-risk detections"
        />
        <GlanceCard
          title="Legitimate"
          value={realJobs}
          suffix=" jobs"
          icon={Gauge}
          subtitle={`Latency ${Math.round(systemMetrics.avg_latency_ms)} ms | Queue ${systemMetrics.queue_backlog}`}
        />
        <GlanceCard
          title="Fraud Rate"
          value={Math.round(displayedFraudRate)}
          suffix="%"
          change={metricDelta(fakeSeries)}
          sparklineData={fakeSeries.map((value, idx) => {
            const total = Math.max(1, totalSeries[idx] ?? 1)
            return Number(((value / total) * 100).toFixed(1))
          })}
          variant={displayedFraudRate >= 45 ? "warning" : "default"}
          subtitle={`Anomaly ${anomalyPercent.toFixed(1)}% | Errors ${(systemMetrics.error_rate * 100).toFixed(1)}%`}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PipelineVisual
          activeStep={pipelineStep}
          burstMode={displayedFraudRate >= 40 || anomalyPercent >= 20 || highPressureClusters > 0}
          pipelineLabel="producer->kafka->spark->ml->postgres->api"
        />

        <section className="rounded-2xl border border-border bg-[rgba(255,255,255,0.02)] p-4 md:p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-foreground">Throughput Trend</h2>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="throughput-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00ffb2" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#00ffb2" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tick={{ fill: "#8f8f8f", fontSize: 11 }} />
                <YAxis tick={{ fill: "#8f8f8f", fontSize: 11 }} />
                <Tooltip content={<NeonTooltip />} />
                <Area
                  type="monotone"
                  dataKey="throughput"
                  name="Jobs/s"
                  stroke="#00ffb2"
                  fill="url(#throughput-fill)"
                  strokeWidth={2}
                  isAnimationActive={!isLoading}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
        <motion.section
          className="rounded-2xl border border-border bg-[rgba(255,255,255,0.02)] p-4 md:p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-foreground">Detection Trend</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tick={{ fill: "#8f8f8f", fontSize: 11 }} />
                <YAxis tick={{ fill: "#8f8f8f", fontSize: 11 }} />
                <Tooltip content={<NeonTooltip />} />
                <Line type="monotone" dataKey="fakeJobs" name="Fake" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="realJobs" name="Real" stroke="#00ffb2" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <SystemLoadPanel />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
        <FraudAlertsPanel />
        <ScoreCorrectionsPanel />
      </div>

      <SystemIntelligencePanel />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <DashboardPageInner />
    </DashboardLayout>
  )
}
