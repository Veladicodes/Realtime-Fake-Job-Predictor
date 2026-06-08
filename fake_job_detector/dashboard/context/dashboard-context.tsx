"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  connectRealtime,
  getAlerts,
  getClusterSpikes,
  getCorrections,
  getDashboardMetrics,
  getSystemMetrics,
  getSystemStatus,
  getTopRiskClusters,
  getTrends,
  type AlertItem,
  type ClusterRiskItem,
  type ClusterSpikeItem,
  type CorrectionItem,
  type DashboardMetrics,
  type PredictionStreamItem,
  type RealtimeEvent,
  type RealtimeSnapshot,
  type SystemMetrics,
  type SystemStatus,
  type TrendItem,
} from "@/services/api"

const HISTORY_WINDOW = 12
const MAX_ALERT_ITEMS = 50

export type AlertLevel = "critical" | "warning" | "info"

export interface FraudAlert {
  id: string
  jobTitle: string
  confidence: number
  reason: string
  timestamp: Date
  level: AlertLevel
  isCorrected: boolean
  clusterId: string | null
}

export interface ScoreCorrection {
  jobId: string
  jobTitle: string
  clusterId: string | null
  correctionType: "UPGRADE_TO_FRAUD" | "RISK_INCREASE"
  oldScore: number
  newScore: number
  reason: string
  updatedAt: Date
}

export interface RiskCluster {
  clusterId: string
  jobs1h: number
  jobs6h: number
  jobs24h: number
  pressureScore: number
  correctedJobs: number
  peakScore: number
}

export interface ClusterSpikePoint {
  timestamp: string
  clusterJobs: number
  corrections: number
}

export interface Notification {
  id: string
  title: string
  message: string
  type: "success" | "warning" | "error" | "info"
  timestamp: Date
}

export interface TrendDataPoint {
  timestamp: string
  totalJobs: number
  fakeJobs: number
  realJobs: number
  throughput: number
}

export interface ServiceHealthHistory {
  kafka: number[]
  spark: number[]
  ml: number[]
  database: number[]
}

export interface DashboardSystemStatus {
  kafka: "running" | "down"
  spark: "active" | "idle" | "down"
  ml: "loaded" | "unloaded"
  database: "connected" | "disconnected" | "down"
  degraded: boolean
  mode: "normal" | "degraded" | "recovery"
  messages: string[]
}

export type DashboardSystemPhase = "idle" | "analyzing" | "cluster_forming" | "fraud_detected"

interface DashboardState {
  totalJobs: number
  fakeJobs: number
  realJobs: number
  fakePercentage: number
  correctedJobs: number
  highPressureClusters: number
  throughput: number
  avgConfidence: number
  throughputHistory: number[]
  latencyHistory: number[]

  systemStatus: DashboardSystemStatus
  systemMetrics: SystemMetrics
  alerts: FraudAlert[]
  corrections: ScoreCorrection[]
  topRiskClusters: RiskCluster[]
  correctionSpikes: ClusterSpikePoint[]

  systemLoad: {
    currentThroughput: number
    peakThroughput: number
    processingLatency: number
  }

  systemIntelligence: {
    highestFraudCategory: string
    commonFraudReason: string
    suspiciousKeywordSpike: string
    modelConfidence: number
  }

  trends: TrendDataPoint[]

  investigationData: {
    topKeywords: Array<{ keyword: string; count: number }>
    reasonDistribution: Array<{ reason: string; count: number }>
    confidenceDistribution: number[]
  }

  serviceHistory: ServiceHealthHistory
  notifications: Notification[]
  isRunning: boolean
  isStartingSimulation: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  connectionMode: "polling" | "websocket"
  connectionStatus: "connected" | "reconnecting" | "disconnected"
  lastHeartbeatAt: string | null
  isSystemDisconnected: boolean
  systemPhase: DashboardSystemPhase
}

interface DashboardContextType extends DashboardState {
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void
  dismissNotification: (id: string) => void
  refreshMetrics: () => Promise<void>
  setSystemPhase: (phase: DashboardSystemPhase) => void
  startSimulation: () => Promise<null>
  stopSimulation: () => void
}

const initialMetrics: DashboardMetrics = {
  total_jobs: 0,
  fake_jobs: 0,
  real_jobs: 0,
  fake_percentage: 0,
  corrected_jobs: 0,
  high_pressure_clusters: 0,
  throughput: 0,
  avg_confidence: 0,
  last_processed_at: null,
  processing_latency_ms: 0,
}

const initialStatus: DashboardSystemStatus = {
  kafka: "down",
  spark: "down",
  ml: "unloaded",
  database: "down",
  degraded: true,
  mode: "degraded",
  messages: ["System booting - waiting for live services"],
}

const initialSystemMetrics: SystemMetrics = {
  throughput_jobs_per_sec: 0,
  avg_latency_ms: 0,
  error_rate: 0,
  fraud_rate: 0,
  anomaly_rate: 0,
  kafka_lag: 0,
  spark_batch_time_ms: 0,
  db_insert_time_ms: 0,
  queue_backlog: 0,
  samples: 0,
}

const initialServiceHistory: ServiceHealthHistory = {
  kafka: [],
  spark: [],
  ml: [],
  database: [],
}

const stopWords = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "job",
  "posting",
  "model",
  "flagged",
  "fraud",
  "risk",
  "high",
  "low",
  "detected",
])

function appendHistory(history: number[], nextValue: number): number[] {
  const numeric = Number(nextValue)
  const safeValue = Number.isFinite(numeric) ? numeric : 0
  return [...history, safeValue].slice(-HISTORY_WINDOW)
}

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clampUnit(value: unknown): number {
  return Math.max(0, Math.min(1, safeNumber(value, 0)))
}

function isKafkaActive(state: SystemStatus["kafka"]): boolean {
  return state === "running"
}

function isSparkActive(state: SystemStatus["spark"]): boolean {
  return state === "active"
}

function isMlActive(state: SystemStatus["ml"]): boolean {
  return state === "loaded"
}

function isDatabaseActive(state: SystemStatus["db"]): boolean {
  return state === "connected"
}

function mapStatus(payload: SystemStatus): DashboardSystemStatus {
  const degraded =
    payload.degraded ||
    !isKafkaActive(payload.kafka) ||
    !isDatabaseActive(payload.db) ||
    !isMlActive(payload.ml)

  return {
    kafka: payload.kafka,
    spark: payload.spark,
    ml: payload.ml,
    database: payload.db,
    degraded,
    mode: payload.mode ?? (degraded ? "degraded" : "normal"),
    messages: payload.messages ?? [],
  }
}

function mapAlert(alert: AlertItem): FraudAlert {
  const timestamp = new Date(alert.timestamp)
  const confidence = clampUnit(alert.risk_score)

  return {
    id: alert.id,
    jobTitle: alert.job_title,
    confidence,
    reason: alert.reason,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    level: alert.level,
    isCorrected: Boolean(alert.is_corrected),
    clusterId: alert.cluster_id ?? null,
  }
}

function mapPredictionToAlert(item: PredictionStreamItem): FraudAlert | null {
  if (item.prediction !== "FAKE") {
    return null
  }

  const timestamp = new Date(item.timestamp)
  const confidence = clampUnit(item.risk_score || item.confidence)

  return {
    id: item.id || item.job_id,
    jobTitle: item.title,
    confidence,
    reason: item.reason,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    level: confidence >= 0.9 ? "critical" : confidence >= 0.75 ? "warning" : "info",
    isCorrected: Boolean(item.is_corrected),
    clusterId: item.cluster_id ?? null,
  }
}

function sortAlertsDescending(alerts: FraudAlert[]): FraudAlert[] {
  return alerts
    .slice()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime() || b.confidence - a.confidence)
    .slice(0, MAX_ALERT_ITEMS)
}

function mergeSingleAlert(existing: FraudAlert[], incoming: FraudAlert): FraudAlert[] {
  const next = [incoming, ...existing.filter((item) => item.id !== incoming.id)]
  return sortAlertsDescending(next)
}

function mapTrend(point: TrendItem): TrendDataPoint {
  const totalJobs = Math.max(0, Math.floor(safeNumber(point.total_jobs, 0)))
  const fakeJobs = Math.max(0, Math.floor(safeNumber(point.fake_jobs, 0)))
  const realJobs = Math.max(0, Math.floor(safeNumber(point.real_jobs, totalJobs - fakeJobs)))

  return {
    timestamp: point.timestamp,
    totalJobs,
    fakeJobs,
    realJobs,
    throughput: Math.max(0, safeNumber(point.throughput, 0)),
  }
}

function mapCorrection(item: CorrectionItem): ScoreCorrection {
  const updatedAt = new Date(item.updated_at)
  return {
    jobId: item.job_id,
    jobTitle: item.job_title,
    clusterId: item.cluster_id ?? null,
    correctionType: item.correction_type,
    oldScore: clampUnit(item.old_score),
    newScore: clampUnit(item.new_score),
    reason: item.reason,
    updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
  }
}

function mapCluster(item: ClusterRiskItem): RiskCluster {
  return {
    clusterId: item.cluster_id,
    jobs1h: Math.max(0, Math.floor(safeNumber(item.jobs_1h, 0))),
    jobs6h: Math.max(0, Math.floor(safeNumber(item.jobs_6h, 0))),
    jobs24h: Math.max(0, Math.floor(safeNumber(item.jobs_24h, 0))),
    pressureScore: Math.max(0, safeNumber(item.pressure_score, 0)),
    correctedJobs: Math.max(0, Math.floor(safeNumber(item.corrected_jobs, 0))),
    peakScore: clampUnit(item.peak_score),
  }
}

function mapClusterSpike(item: ClusterSpikeItem): ClusterSpikePoint {
  return {
    timestamp: item.timestamp,
    clusterJobs: Math.max(0, Math.floor(safeNumber(item.cluster_jobs, 0))),
    corrections: Math.max(0, Math.floor(safeNumber(item.corrections, 0))),
  }
}

function classifyCategory(title: string): string {
  const normalized = title.toLowerCase()
  if (normalized.includes("remote")) return "Remote"
  if (normalized.includes("engineer") || normalized.includes("developer")) return "Engineering"
  if (normalized.includes("analyst") || normalized.includes("data")) return "Data"
  if (normalized.includes("manager") || normalized.includes("lead")) return "Management"
  if (normalized.includes("designer")) return "Design"
  return "General"
}

function buildInvestigationData(alerts: FraudAlert[]) {
  const keywordMap = new Map<string, number>()
  const reasonMap = new Map<string, number>()
  const confidenceDistribution = Array.from({ length: 10 }, () => 0)

  alerts.forEach((alert) => {
    const reason = alert.reason.trim() || "Unknown reason"
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)

    const confidence = clampUnit(alert.confidence)
    const index = Math.min(9, Math.max(0, Math.floor(confidence * 10)))
    confidenceDistribution[index] += 1

    const combined = `${alert.jobTitle} ${alert.reason}`.toLowerCase()
    combined
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !stopWords.has(token))
      .forEach((token) => {
        keywordMap.set(token, (keywordMap.get(token) ?? 0) + 1)
      })
  })

  const topKeywords = Array.from(keywordMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([keyword, count]) => ({ keyword, count }))

  const reasonDistribution = Array.from(reasonMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }))

  return {
    topKeywords,
    reasonDistribution,
    confidenceDistribution,
  }
}

function buildSystemIntelligence(alerts: FraudAlert[], avgConfidence: number) {
  const safeAvgConfidence = clampUnit(avgConfidence)

  if (alerts.length === 0) {
    return {
      highestFraudCategory: "Insufficient data",
      commonFraudReason: "No alerts yet",
      suspiciousKeywordSpike: "No keyword spike",
      modelConfidence: Math.round(safeAvgConfidence * 1000) / 10,
    }
  }

  const categoryMap = new Map<string, number>()
  const reasonMap = new Map<string, number>()
  const keywordMap = new Map<string, number>()

  alerts.forEach((alert) => {
    const category = classifyCategory(alert.jobTitle)
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1)

    const reason = alert.reason.trim() || "Unknown reason"
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)

    alert.reason
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !stopWords.has(token))
      .forEach((token) => keywordMap.set(token, (keywordMap.get(token) ?? 0) + 1))
  })

  const highestFraudCategory = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "General"
  const commonFraudReason = Array.from(reasonMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No dominant reason"
  const topKeyword = Array.from(keywordMap.entries()).sort((a, b) => b[1] - a[1])[0]

  return {
    highestFraudCategory,
    commonFraudReason,
    suspiciousKeywordSpike: topKeyword ? `${topKeyword[0]} +${topKeyword[1]}` : "No keyword spike",
    modelConfidence: Math.round(safeAvgConfidence * 1000) / 10,
  }
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const wsDisabled = process.env.NEXT_PUBLIC_ENABLE_WS === "false"

  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics)
  const [throughputHistory, setThroughputHistory] = useState<number[]>([])
  const [latencyHistory, setLatencyHistory] = useState<number[]>([])
  const [alerts, setAlerts] = useState<FraudAlert[]>([])
  const [trends, setTrends] = useState<TrendDataPoint[]>([])
  const [corrections, setCorrections] = useState<ScoreCorrection[]>([])
  const [topRiskClusters, setTopRiskClusters] = useState<RiskCluster[]>([])
  const [correctionSpikes, setCorrectionSpikes] = useState<ClusterSpikePoint[]>([])
  const [systemStatus, setSystemStatus] = useState<DashboardSystemStatus>(initialStatus)
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>(initialSystemMetrics)
  const [serviceHistory, setServiceHistory] = useState<ServiceHealthHistory>(initialServiceHistory)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isRunning, setIsRunning] = useState(true)
  const [isStartingSimulation, setIsStartingSimulation] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionMode, setConnectionMode] = useState<"polling" | "websocket">("polling")
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "reconnecting" | "disconnected">("disconnected")
  const [lastHeartbeatMs, setLastHeartbeatMs] = useState<number | null>(null)
  const [systemPhase, setSystemPhase] = useState<DashboardSystemPhase>("idle")

  const hasLoadedRef = useRef(false)
  const activeSessionIdRef = useRef<string | null>(null)

  const applyStatus = useCallback((incomingStatus: SystemStatus) => {
    const nextStatus = mapStatus(incomingStatus)
    setSystemStatus(nextStatus)

    setServiceHistory((prev) => ({
      kafka: appendHistory(prev.kafka, isKafkaActive(nextStatus.kafka) ? 1 : 0),
      spark: appendHistory(prev.spark, isSparkActive(nextStatus.spark) ? 1 : nextStatus.spark === "idle" ? 0.55 : 0),
      ml: appendHistory(prev.ml, isMlActive(nextStatus.ml) ? 1 : 0),
      database: appendHistory(prev.database, isDatabaseActive(nextStatus.database) ? 1 : 0),
    }))
  }, [])

  const applySnapshot = useCallback(
    (snapshot: RealtimeSnapshot) => {
      if (snapshot.metrics) {
        const nextMetrics = snapshot.metrics
        setMetrics({
          ...nextMetrics,
          throughput: Math.max(0, safeNumber(nextMetrics.throughput, 0)),
          processing_latency_ms: Math.max(0, safeNumber(nextMetrics.processing_latency_ms, 0)),
          avg_confidence: clampUnit(nextMetrics.avg_confidence),
        })
        setThroughputHistory((prev) => appendHistory(prev, safeNumber(nextMetrics.throughput, 0)))
        setLatencyHistory((prev) => appendHistory(prev, safeNumber(nextMetrics.processing_latency_ms, 0)))
      }

      if (snapshot.system_metrics) {
        setSystemMetrics(snapshot.system_metrics)
      }

      if (snapshot.alerts) {
        setAlerts(sortAlertsDescending(snapshot.alerts.map(mapAlert)))
      }

      if (snapshot.trends) {
        setTrends(snapshot.trends.map(mapTrend))
      }

      if (snapshot.corrections) {
        setCorrections(snapshot.corrections.map(mapCorrection))
      }

      if (snapshot.top_clusters) {
        setTopRiskClusters(snapshot.top_clusters.map(mapCluster))
      }

      if (snapshot.cluster_spikes) {
        setCorrectionSpikes(snapshot.cluster_spikes.map(mapClusterSpike))
      }

      if (snapshot.status) {
        applyStatus(snapshot.status)
      }

      hasLoadedRef.current = true
      setError(null)
      setIsLoading(false)
    },
    [applyStatus]
  )

  const applyRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      const incomingSessionId =
        typeof event.session_id === "string" && event.session_id.trim().length > 0 ? event.session_id : null

      if (event.type !== "snapshot") {
        const activeSessionId = activeSessionIdRef.current
        if (incomingSessionId && activeSessionId && incomingSessionId !== activeSessionId) {
          return
        }
      }

      switch (event.type) {
        case "snapshot": {
          if (incomingSessionId) {
            activeSessionIdRef.current = incomingSessionId
          }

          if (event.payload && typeof event.payload === "object") {
            applySnapshot(event.payload as RealtimeSnapshot)
          }
          return
        }
        case "stats": {
          const payload = event.payload as DashboardMetrics | undefined
          if (!payload) {
            return
          }

          setMetrics({
            ...payload,
            throughput: Math.max(0, safeNumber(payload.throughput, 0)),
            processing_latency_ms: Math.max(0, safeNumber(payload.processing_latency_ms, 0)),
            avg_confidence: clampUnit(payload.avg_confidence),
          })
          setThroughputHistory((prev) => appendHistory(prev, safeNumber(payload.throughput, 0)))
          setLatencyHistory((prev) => appendHistory(prev, safeNumber(payload.processing_latency_ms, 0)))
          hasLoadedRef.current = true
          setError(null)
          setIsLoading(false)
          return
        }
        case "status": {
          const payload = event.payload as SystemStatus | undefined
          if (!payload) {
            return
          }

          applyStatus(payload)
          setLatencyHistory((prev) => appendHistory(prev, safeNumber(payload.processing_latency_ms, 0)))
          hasLoadedRef.current = true
          setError(null)
          setIsLoading(false)
          return
        }
        case "alerts": {
          const payload = event.payload as AlertItem[] | undefined
          if (!payload) {
            return
          }

          setAlerts(sortAlertsDescending(payload.map(mapAlert)))
          return
        }
        case "alert": {
          const payload = event.payload as AlertItem | undefined
          if (!payload) {
            return
          }

          setAlerts((prev) => mergeSingleAlert(prev, mapAlert(payload)))
          return
        }
        case "prediction": {
          const payload = event.payload as PredictionStreamItem | undefined
          if (!payload) {
            return
          }

          setMetrics((prev) => {
            const nextTotal = prev.total_jobs + 1
            const nextFake = prev.fake_jobs + (payload.prediction === "FAKE" ? 1 : 0)
            const nextReal = prev.real_jobs + (payload.prediction === "REAL" ? 1 : 0)
            const nextFakePercentage = nextTotal > 0 ? (nextFake / nextTotal) * 100 : 0
            return {
              ...prev,
              total_jobs: nextTotal,
              fake_jobs: nextFake,
              real_jobs: nextReal,
              fake_percentage: nextFakePercentage,
              avg_confidence: clampUnit((prev.avg_confidence + clampUnit(payload.confidence)) / 2),
              last_processed_at: payload.timestamp,
            }
          })

          const derivedAlert = mapPredictionToAlert(payload)
          if (derivedAlert) {
            setAlerts((prev) => mergeSingleAlert(prev, derivedAlert))
          }
          return
        }
        case "new_prediction": {
          const payload = event.payload as PredictionStreamItem | undefined
          if (!payload) {
            return
          }

          setMetrics((prev) => {
            const nextTotal = prev.total_jobs + 1
            const nextFake = prev.fake_jobs + (payload.prediction === "FAKE" ? 1 : 0)
            const nextReal = prev.real_jobs + (payload.prediction === "REAL" ? 1 : 0)
            const nextFakePercentage = nextTotal > 0 ? (nextFake / nextTotal) * 100 : 0
            return {
              ...prev,
              total_jobs: nextTotal,
              fake_jobs: nextFake,
              real_jobs: nextReal,
              fake_percentage: nextFakePercentage,
              avg_confidence: clampUnit((prev.avg_confidence + clampUnit(payload.confidence)) / 2),
              last_processed_at: payload.timestamp,
            }
          })

          const derivedAlert = mapPredictionToAlert(payload)
          if (derivedAlert) {
            setAlerts((prev) => mergeSingleAlert(prev, derivedAlert))
          }
          return
        }
        case "new_alert": {
          const payload = event.payload as AlertItem | undefined
          if (!payload) {
            return
          }

          setAlerts((prev) => mergeSingleAlert(prev, mapAlert(payload)))
          return
        }
        case "system_metrics": {
          const payload = event.payload as SystemMetrics | undefined
          if (!payload) {
            return
          }

          setSystemMetrics(payload)
          return
        }
        case "trends": {
          const payload = event.payload as TrendItem[] | undefined
          if (!payload) {
            return
          }

          setTrends(payload.map(mapTrend))
          return
        }
        case "corrections": {
          const payload = event.payload as CorrectionItem[] | undefined
          if (!payload) {
            return
          }

          setCorrections(payload.map(mapCorrection))
          return
        }
        case "top_clusters": {
          const payload = event.payload as ClusterRiskItem[] | undefined
          if (!payload) {
            return
          }

          setTopRiskClusters(payload.map(mapCluster))
          return
        }
        case "cluster_spikes": {
          const payload = event.payload as ClusterSpikeItem[] | undefined
          if (!payload) {
            return
          }

          setCorrectionSpikes(payload.map(mapClusterSpike))
          return
        }
        case "heartbeat": {
          const heartbeatAt = event.timestamp ? new Date(event.timestamp).getTime() : Date.now()
          setLastHeartbeatMs(Number.isFinite(heartbeatAt) ? heartbeatAt : Date.now())
          setConnectionStatus("connected")
          setConnectionMode("websocket")
          setError((prev) =>
            prev === "Live stream reconnecting" || prev === "Telemetry delay detected" || prev === "Stream heartbeat lost"
              ? null
              : prev
          )
          setIsLoading(false)
          return
        }
        default:
          return
      }
    },
    [applySnapshot, applyStatus]
  )

  const refreshMetrics = useCallback(async (force = false) => {
    if (!isRunning && !force) {
      return
    }

    setIsRefreshing(true)

    const results = await Promise.allSettled([
      getDashboardMetrics(),
      getSystemMetrics(),
      getAlerts(),
      getTrends(),
      getSystemStatus(),
      getCorrections(),
      getTopRiskClusters(),
      getClusterSpikes(),
    ])

    let successfulFetches = 0

    const metricsResult = results[0]
    if (metricsResult.status === "fulfilled") {
      successfulFetches += 1
      setMetrics({
        ...metricsResult.value,
        throughput: Math.max(0, safeNumber(metricsResult.value.throughput, 0)),
        processing_latency_ms: Math.max(0, safeNumber(metricsResult.value.processing_latency_ms, 0)),
        avg_confidence: clampUnit(metricsResult.value.avg_confidence),
      })
      setThroughputHistory((prev) => appendHistory(prev, safeNumber(metricsResult.value.throughput, 0)))
      setLatencyHistory((prev) => appendHistory(prev, safeNumber(metricsResult.value.processing_latency_ms, 0)))
    }

    const systemMetricsResult = results[1]
    if (systemMetricsResult.status === "fulfilled") {
      successfulFetches += 1
      setSystemMetrics(systemMetricsResult.value)
    }

    const alertsResult = results[2]
    if (alertsResult.status === "fulfilled") {
      successfulFetches += 1
      setAlerts(sortAlertsDescending(alertsResult.value.map(mapAlert)))
    }

    const trendsResult = results[3]
    if (trendsResult.status === "fulfilled") {
      successfulFetches += 1
      setTrends(trendsResult.value.map(mapTrend))
    }

    const statusResult = results[4]
    if (statusResult.status === "fulfilled") {
      successfulFetches += 1
      applyStatus(statusResult.value)
      if (metricsResult.status !== "fulfilled") {
        setLatencyHistory((prev) => appendHistory(prev, safeNumber(statusResult.value.processing_latency_ms, 0)))
      }
    }

    const correctionsResult = results[5]
    if (correctionsResult.status === "fulfilled") {
      successfulFetches += 1
      setCorrections(correctionsResult.value.map(mapCorrection))
    }

    const clustersResult = results[6]
    if (clustersResult.status === "fulfilled") {
      successfulFetches += 1
      setTopRiskClusters(clustersResult.value.map(mapCluster))
    }

    const spikesResult = results[7]
    if (spikesResult.status === "fulfilled") {
      successfulFetches += 1
      setCorrectionSpikes(spikesResult.value.map(mapClusterSpike))
    }

    hasLoadedRef.current = hasLoadedRef.current || successfulFetches > 0

    if (successfulFetches === 0) {
      setError("Live stream reconnecting")
    } else if (successfulFetches < 7) {
      setError("Telemetry delay detected")
    } else {
      setError(null)
    }

    setIsLoading(false)
    setIsRefreshing(false)
  }, [applyStatus, isRunning])

  const startSimulation = useCallback(async () => {
    if (isStartingSimulation) {
      return null
    }

    setIsStartingSimulation(true)
    setIsRunning(true)
    setIsLoading(true)
    try {
      await refreshMetrics(true)
      return null
    } finally {
      setIsStartingSimulation(false)
    }
  }, [isStartingSimulation, refreshMetrics])

  const stopSimulation = useCallback(() => {
    setIsRunning(false)
    setIsStartingSimulation(false)
    setIsLoading(false)
    setIsRefreshing(false)
    setConnectionMode("polling")
    setConnectionStatus("disconnected")
    setLastHeartbeatMs(null)
    setSystemPhase("idle")
    setError(null)
  }, [])

  useEffect(() => {
    if (!isRunning) {
      return
    }

    setIsLoading(true)
    const kickoffId = window.setTimeout(() => {
      void refreshMetrics()
    }, 0)

    return () => {
      window.clearTimeout(kickoffId)
    }
  }, [isRunning, refreshMetrics])

  useEffect(() => {
    if (!isRunning || wsDisabled) {
      return
    }

    const disconnect = connectRealtime(
      (event) => {
        setConnectionMode("websocket")
        applyRealtimeEvent(event)
      },
      (state) => {
        if (state === "open") {
          setConnectionMode("websocket")
          setConnectionStatus("connected")
          setLastHeartbeatMs(Date.now())
          setError(null)
          return
        }

        if (state === "connecting") {
          setConnectionStatus("reconnecting")
          setConnectionMode("polling")
          return
        }

        if (state === "closed" || state === "error") {
          setConnectionStatus("reconnecting")
          setConnectionMode("polling")
        }
      },
      {
        reconnect: true,
        reconnectBaseDelayMs: 500,
        maxReconnectDelayMs: 10000,
      }
    )

    return () => {
      disconnect()
    }
  }, [applyRealtimeEvent, isRunning, wsDisabled])

  useEffect(() => {
    if (!isRunning) {
      return
    }

    if (connectionMode === "websocket") {
      return
    }

    const pollId = window.setInterval(() => {
      void refreshMetrics()
    }, 4000)

    return () => {
      window.clearInterval(pollId)
    }
  }, [connectionMode, isRunning, refreshMetrics])

  const investigationData = useMemo(() => buildInvestigationData(alerts), [alerts])
  const systemIntelligence = useMemo(
    () => buildSystemIntelligence(alerts, safeNumber(metrics.avg_confidence, 0)),
    [alerts, metrics.avg_confidence]
  )

  const peakThroughput = useMemo(() => {
    const trendPeak = trends.reduce((maxValue, item) => Math.max(maxValue, safeNumber(item.throughput, 0)), 0)
    return Math.max(safeNumber(metrics.throughput, 0), trendPeak)
  }, [metrics.throughput, trends])

  const systemLoad = useMemo(
    () => ({
      currentThroughput: Math.max(0, safeNumber(metrics.throughput, 0)),
      peakThroughput,
      processingLatency: Math.max(0, safeNumber(metrics.processing_latency_ms, 0)),
    }),
    [metrics.processing_latency_ms, metrics.throughput, peakThroughput]
  )

  const addNotification = useCallback((notification: Omit<Notification, "id" | "timestamp">) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}`,
      timestamp: new Date(),
    }

    setNotifications((prev) => [newNotification, ...prev].slice(0, 10))

    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== newNotification.id))
    }, 5000)
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const value: DashboardContextType = {
    totalJobs: metrics.total_jobs,
    fakeJobs: metrics.fake_jobs,
    realJobs: metrics.real_jobs,
    fakePercentage: metrics.fake_percentage,
    correctedJobs: metrics.corrected_jobs,
    highPressureClusters: metrics.high_pressure_clusters,
    throughput: metrics.throughput,
    avgConfidence: metrics.avg_confidence,
    throughputHistory,
    latencyHistory,
    systemStatus,
    systemMetrics,
    alerts,
    corrections,
    topRiskClusters,
    correctionSpikes,
    systemLoad,
    systemIntelligence,
    trends,
    investigationData,
    serviceHistory,
    notifications,
    isRunning,
    isStartingSimulation,
    isLoading,
    isRefreshing,
    error,
    connectionMode,
    connectionStatus,
    lastHeartbeatAt: lastHeartbeatMs ? new Date(lastHeartbeatMs).toISOString() : null,
    isSystemDisconnected: connectionStatus === "disconnected",
    systemPhase,
    addNotification,
    dismissNotification,
    refreshMetrics,
    setSystemPhase,
    startSimulation,
    stopSimulation,
  }

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

const defaultContextValue: DashboardContextType = {
  totalJobs: 0,
  fakeJobs: 0,
  realJobs: 0,
  fakePercentage: 0,
  correctedJobs: 0,
  highPressureClusters: 0,
  throughput: 0,
  avgConfidence: 0,
  throughputHistory: [],
  latencyHistory: [],
  systemStatus: initialStatus,
  systemMetrics: initialSystemMetrics,
  alerts: [],
  corrections: [],
  topRiskClusters: [],
  correctionSpikes: [],
  systemLoad: {
    currentThroughput: 0,
    peakThroughput: 0,
    processingLatency: 0,
  },
  systemIntelligence: {
    highestFraudCategory: "Insufficient data",
    commonFraudReason: "No alerts yet",
    suspiciousKeywordSpike: "No keyword spike",
    modelConfidence: 0,
  },
  trends: [],
  investigationData: {
    topKeywords: [],
    reasonDistribution: [],
    confidenceDistribution: Array.from({ length: 10 }, () => 0),
  },
  serviceHistory: initialServiceHistory,
  notifications: [],
  isRunning: false,
  isStartingSimulation: false,
  isLoading: false,
  isRefreshing: false,
  error: null,
  connectionMode: "polling",
  connectionStatus: "disconnected",
  lastHeartbeatAt: null,
  isSystemDisconnected: true,
  systemPhase: "idle",
  addNotification: () => undefined,
  dismissNotification: () => undefined,
  refreshMetrics: async () => undefined,
  setSystemPhase: () => undefined,
  startSimulation: async () => null,
  stopSimulation: () => undefined,
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (context === undefined) {
    return defaultContextValue
  }
  return context
}
