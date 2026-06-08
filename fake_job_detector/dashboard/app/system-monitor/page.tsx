"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { SystemLoadPanel, SystemIntelligencePanel } from "@/components/dashboard/system-panels"
import { useDashboard } from "@/context/dashboard-context"
import { LiveIndicator } from "@/components/dashboard/live-indicator"

function SystemMonitorPageInner() {
  const { systemStatus, systemMetrics } = useDashboard()

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <LiveIndicator />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          System Monitor
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2">
          Real-time streaming pipeline health and performance telemetry
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemLoadPanel />
        <SystemIntelligencePanel />
      </div>

      {systemStatus.degraded && (
        <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          {(systemStatus.messages.length > 0
            ? systemStatus.messages.join(" | ")
            : "Telemetry recovering")
            .toUpperCase()}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Throughput</p>
          <p className="mt-2 font-mono text-lg font-semibold text-foreground">
            {systemMetrics.throughput_jobs_per_sec.toFixed(2)} jobs/s
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Latency</p>
          <p className="mt-2 font-mono text-lg font-semibold text-foreground">{systemMetrics.avg_latency_ms.toFixed(1)} ms</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Anomaly Rate</p>
          <p className="mt-2 font-mono text-lg font-semibold text-foreground">
            {(systemMetrics.anomaly_rate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Error Rate</p>
          <p className="mt-2 font-mono text-lg font-semibold text-foreground">
            {(systemMetrics.error_rate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Kafka Lag</p>
          <p className="mt-2 font-mono text-lg font-semibold text-foreground">{systemMetrics.kafka_lag}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Spark Batch Time</p>
          <p className="mt-2 font-mono text-lg font-semibold text-foreground">
            {systemMetrics.spark_batch_time_ms.toFixed(1)} ms
          </p>
        </div>
      </div>

      {/* Detailed System Status */}
      <div className="mt-6 bg-card border border-border p-6">
        <h2 className="text-sm font-semibold mb-6">Detailed System Status</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-border">
            <div>
              <h3 className="font-mono font-semibold">Kafka Ingress Layer</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Incoming stream feed status
              </p>
            </div>
            <div className="flex items-center gap-2">
              {systemStatus.kafka === "running" ? (
                <>
                  <div className="w-2 h-2 bg-primary rounded-full pulse-live" />
                  <span className="text-xs font-mono text-primary">OPERATIONAL</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-destructive rounded-full" />
                  <span className="text-xs font-mono text-destructive">DOWN</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border border-border">
            <div>
              <h3 className="font-mono font-semibold">Apache Spark</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Stream processing stage
              </p>
            </div>
            <div className="flex items-center gap-2">
              {systemStatus.spark === "active" ? (
                <>
                  <div className="w-2 h-2 bg-primary rounded-full pulse-live" />
                  <span className="text-xs font-mono text-primary">OPERATIONAL</span>
                </>
              ) : systemStatus.spark === "idle" ? (
                <>
                  <div className="w-2 h-2 bg-primary/65 rounded-full pulse-live" />
                  <span className="text-xs font-mono text-primary/80">STANDBY</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-destructive rounded-full" />
                  <span className="text-xs font-mono text-destructive">DOWN</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border border-border">
            <div>
              <h3 className="font-mono font-semibold">ML Inference Engine</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Fraud scoring model availability
              </p>
            </div>
            <div className="flex items-center gap-2">
              {systemStatus.ml === "loaded" ? (
                <>
                  <div className="w-2 h-2 bg-primary rounded-full pulse-live" />
                  <span className="text-xs font-mono text-primary">LOADED</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-destructive rounded-full" />
                  <span className="text-xs font-mono text-destructive">UNLOADED</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border border-border">
            <div>
              <h3 className="font-mono font-semibold">Database Cluster</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Persistence sink and historical metrics
              </p>
            </div>
            <div className="flex items-center gap-2">
              {systemStatus.database === "connected" ? (
                <>
                  <div className="w-2 h-2 bg-primary rounded-full pulse-live" />
                  <span className="text-xs font-mono text-primary">OPERATIONAL</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-destructive rounded-full" />
                  <span className="text-xs font-mono text-destructive">DOWN</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SystemMonitorPage() {
  return (
    <DashboardLayout>
      <SystemMonitorPageInner />
    </DashboardLayout>
  )
}
