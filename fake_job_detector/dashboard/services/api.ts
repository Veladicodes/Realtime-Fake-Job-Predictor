const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "")
const WS_BASE_URL = (
  process.env.NEXT_PUBLIC_WS_URL ??
  API_BASE_URL.replace(/^http/i, (protocol) => (protocol.toLowerCase() === "https" ? "wss" : "ws"))
).replace(/\/$/, "")

const DEFAULT_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? 8000)
const DEFAULT_RETRIES = Number(process.env.NEXT_PUBLIC_API_RETRIES ?? 2)

export type PredictionLabel = "FAKE" | "REAL"

export interface AnalyzeJobPayload {
  title: string
  description: string
  requirements: string
  companyInfo: string
}

export interface AnalyzeJobResult {
  job_id?: string
  prediction: PredictionLabel
  confidence: number
  reason: string
  explanation: string[]
  cluster_id?: string
  note?: string
  original_score?: number
  updated_score?: number
  is_corrected?: boolean
  timestamp?: string
}

export interface DashboardMetrics {
  total_jobs: number
  fake_jobs: number
  real_jobs: number
  fake_percentage: number
  throughput: number
  avg_confidence: number
  last_processed_at: string | null
  processing_latency_ms: number
  corrected_jobs: number
  high_pressure_clusters: number
}

export interface AlertItem {
  id: string
  job_title: string
  risk: number
  risk_score: number
  reason: string
  timestamp: string
  level: "critical" | "warning" | "info"
  is_corrected?: boolean
  cluster_id?: string | null
  correction_reason?: string | null
}

export interface CorrectionItem {
  job_id: string
  job_title: string
  cluster_id?: string | null
  correction_type: "UPGRADE_TO_FRAUD" | "RISK_INCREASE"
  old_score: number
  new_score: number
  reason: string
  updated_at: string
}

export interface ClusterRiskItem {
  cluster_id: string
  jobs_1h: number
  jobs_6h: number
  jobs_24h: number
  pressure_score: number
  corrected_jobs: number
  peak_score: number
}

export interface ClusterSpikeItem {
  timestamp: string
  bucket_start?: string
  cluster_jobs: number
  corrections: number
}

export interface TrendItem {
  timestamp: string
  total_jobs: number
  fake_jobs: number
  real_jobs: number
  throughput: number
}

export interface SystemStatus {
  kafka: "running" | "down"
  spark: "active" | "idle" | "down"
  ml: "loaded" | "unloaded"
  db: "connected" | "disconnected" | "down"
  degraded: boolean
  processing_latency_ms: number
  messages?: string[]
  checked_at?: string
  source?: string
  pipeline?: string
  mode?: "normal" | "degraded" | "recovery"
}

export interface SystemMetrics {
  throughput_jobs_per_sec: number
  avg_latency_ms: number
  error_rate: number
  fraud_rate: number
  anomaly_rate: number
  kafka_lag: number
  spark_batch_time_ms: number
  db_insert_time_ms: number
  queue_backlog: number
  samples: number
  checked_at?: string
  window_minutes?: number
}

export interface RealtimeSnapshot {
  session_id?: string
  metrics?: DashboardMetrics
  system_metrics?: SystemMetrics
  alerts?: AlertItem[]
  trends?: TrendItem[]
  corrections?: CorrectionItem[]
  top_clusters?: ClusterRiskItem[]
  cluster_spikes?: ClusterSpikeItem[]
  status?: SystemStatus
  timestamp?: string
  source?: string
  pipeline?: string
  mode?: string
}

export interface PredictionStreamItem {
  id: string
  job_id: string
  title: string
  prediction: PredictionLabel
  confidence: number
  risk_score: number
  reason: string
  timestamp: string
  cluster_id?: string | null
  is_corrected?: boolean
  correction_reason?: string | null
}

export type RealtimeEventType =
  | "snapshot"
  | "stats"
  | "system_metrics"
  | "status"
  | "alerts"
  | "alert"
  | "prediction"
  | "new_prediction"
  | "new_alert"
  | "trends"
  | "corrections"
  | "top_clusters"
  | "cluster_spikes"
  | "heartbeat"

export interface RealtimeEvent {
  type: RealtimeEventType
  session_id?: string
  source?: string
  pipeline?: string
  mode?: string
  payload?:
    | RealtimeSnapshot
    | DashboardMetrics
    | SystemMetrics
    | SystemStatus
    | AlertItem[]
    | AlertItem
    | PredictionStreamItem
    | TrendItem[]
    | CorrectionItem[]
    | ClusterRiskItem[]
    | ClusterSpikeItem[]
    | Record<string, unknown>
  timestamp?: string
}

export interface RealtimeConnectionOptions {
  reconnect?: boolean
  reconnectBaseDelayMs?: number
  maxReconnectDelayMs?: number
  maxReconnectAttempts?: number
}

class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function normalizePrediction(value: unknown): PredictionLabel {
  if (typeof value === "string") {
    return value.trim().toUpperCase() === "FAKE" ? "FAKE" : "REAL"
  }

  return toNumber(value, 0) === 1 ? "FAKE" : "REAL"
}

function normalizeConfidence(value: unknown): number {
  const numeric = toNumber(value, 0)
  if (numeric > 1) {
    return Math.max(0, Math.min(1, numeric / 100))
  }
  return Math.max(0, Math.min(1, numeric))
}

function normalizeReason(reason: unknown): string {
  if (typeof reason === "string" && reason.trim()) {
    return reason.trim()
  }
  return "Model explanation unavailable"
}

function normalizeLevel(riskPercent: number, rawLevel?: unknown): "critical" | "warning" | "info" {
  if (typeof rawLevel === "string") {
    const lowered = rawLevel.toLowerCase()
    if (lowered === "critical" || lowered === "warning" || lowered === "info") {
      return lowered
    }
  }

  if (riskPercent >= 90) return "critical"
  if (riskPercent >= 75) return "warning"
  return "info"
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out")
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function requestJson<T>(
  paths: string[],
  init: RequestInit,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
  }: { timeoutMs?: number; retries?: number } = {}
): Promise<T> {
  let lastError: unknown

  for (const path of paths) {
    const url = `${API_BASE_URL}${path}`

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url, init, timeoutMs)

        if (!response.ok) {
          throw new ApiError(`Request failed with status ${response.status}`, response.status)
        }

        return (await response.json()) as T
      } catch (error) {
        lastError = error
        if (attempt < retries) {
          await delay(250 * (attempt + 1))
        }
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new ApiError("Request failed")
}

function normalizeAnalyzeResponse(raw: unknown): AnalyzeJobResult {
  const payload = (raw ?? {}) as Record<string, unknown>
  const prediction = normalizePrediction(payload.prediction ?? payload.label)
  const confidence = normalizeConfidence(payload.confidence)
  const reason = normalizeReason(payload.reason)

  const explanationRaw = payload.explanation
  const explanation = Array.isArray(explanationRaw)
    ? explanationRaw.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : typeof explanationRaw === "string" && explanationRaw.trim().length > 0
      ? [explanationRaw.trim()]
      : [reason]

  return {
    job_id: typeof payload.job_id === "string" ? payload.job_id : undefined,
    prediction,
    confidence,
    reason,
    explanation,
    cluster_id: typeof payload.cluster_id === "string" ? payload.cluster_id : undefined,
    note: typeof payload.note === "string" ? payload.note : undefined,
    original_score: toNumber(payload.original_score, 0),
    updated_score: toNumber(payload.updated_score, 0),
    is_corrected: Boolean(payload.is_corrected ?? false),
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : undefined,
  }
}

function normalizeDashboardMetrics(raw: unknown): DashboardMetrics {
  const payload = (raw ?? {}) as Record<string, unknown>
  const totalJobs = Math.max(0, Math.floor(toNumber(payload.total_jobs ?? payload.totalJobs, 0)))
  const fakeJobs = Math.max(0, Math.floor(toNumber(payload.fake_jobs ?? payload.fakeJobs, 0)))
  const realJobs = Math.max(0, Math.floor(toNumber(payload.real_jobs ?? payload.realJobs, totalJobs - fakeJobs)))
  const fakePercentage = toNumber(
    payload.fake_percentage ?? payload.fakePercentage,
    totalJobs > 0 ? (fakeJobs / totalJobs) * 100 : 0
  )

  return {
    total_jobs: totalJobs,
    fake_jobs: fakeJobs,
    real_jobs: realJobs,
    fake_percentage: Math.max(0, fakePercentage),
    throughput: Math.max(0, toNumber(payload.throughput, 0)),
    avg_confidence: normalizeConfidence(payload.avg_confidence ?? payload.avgConfidence),
    last_processed_at: typeof payload.last_processed_at === "string" ? payload.last_processed_at : null,
    processing_latency_ms: Math.max(0, toNumber(payload.processing_latency_ms, 0)),
    corrected_jobs: Math.max(0, Math.floor(toNumber(payload.corrected_jobs ?? payload.correctedJobs, 0))),
    high_pressure_clusters: Math.max(0, Math.floor(toNumber(payload.high_pressure_clusters ?? payload.highPressureClusters, 0))),
  }
}

function normalizeAlerts(raw: unknown): AlertItem[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item, index) => {
      const payload = item as Record<string, unknown>
      const riskScore = normalizeConfidence(payload.risk_score ?? payload.updated_score ?? payload.confidence)
      const riskPercent = toNumber(payload.risk, riskScore * 100)
      const id = typeof payload.id === "string" ? payload.id : `alert-${index}`

      return {
        id,
        job_title: typeof payload.job_title === "string" ? payload.job_title : typeof payload.title === "string" ? payload.title : "Untitled Posting",
        risk: Math.max(0, Math.min(100, riskPercent)),
        risk_score: riskScore,
        reason: normalizeReason(payload.reason),
        timestamp:
          typeof payload.timestamp === "string"
            ? payload.timestamp
            : typeof payload.created_at === "string"
              ? payload.created_at
              : new Date().toISOString(),
        level: normalizeLevel(riskPercent, payload.level),
        is_corrected: Boolean(payload.is_corrected ?? false),
        cluster_id: typeof payload.cluster_id === "string" ? payload.cluster_id : null,
        correction_reason: typeof payload.correction_reason === "string" ? payload.correction_reason : null,
      }
    })
    .sort((a, b) => b.risk - a.risk)
}

function normalizeTrends(raw: unknown): TrendItem[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((item) => {
    const payload = item as Record<string, unknown>
    const totalJobs = Math.max(0, Math.floor(toNumber(payload.total_jobs ?? payload.totalJobs, 0)))
    const fakeJobs = Math.max(0, Math.floor(toNumber(payload.fake_jobs ?? payload.fakeJobs, 0)))
    const realJobs = Math.max(0, Math.floor(toNumber(payload.real_jobs ?? payload.realJobs, totalJobs - fakeJobs)))

    return {
      timestamp: typeof payload.timestamp === "string" ? payload.timestamp : "--:--",
      total_jobs: totalJobs,
      fake_jobs: fakeJobs,
      real_jobs: realJobs,
      throughput: Math.max(0, toNumber(payload.throughput, 0)),
    }
  })
}

function normalizeCorrections(raw: unknown): CorrectionItem[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((item, index) => {
    const payload = item as Record<string, unknown>
    const correctionTypeRaw =
      typeof payload.correction_type === "string" ? payload.correction_type.trim().toUpperCase() : ""
    const correctionType: "UPGRADE_TO_FRAUD" | "RISK_INCREASE" =
      correctionTypeRaw === "UPGRADE_TO_FRAUD" || correctionTypeRaw === "RISK_INCREASE"
        ? correctionTypeRaw
        : toNumber(payload.new_score, 0) >= 0.8
          ? "UPGRADE_TO_FRAUD"
          : "RISK_INCREASE"

    return {
      job_id: typeof payload.job_id === "string" ? payload.job_id : `job-${index}`,
      job_title:
        typeof payload.job_title === "string"
          ? payload.job_title
          : typeof payload.title === "string"
            ? payload.title
            : "Untitled Posting",
      cluster_id: typeof payload.cluster_id === "string" ? payload.cluster_id : null,
      correction_type: correctionType,
      old_score: Math.max(0, Math.min(1, toNumber(payload.old_score, 0))),
      new_score: Math.max(0, Math.min(1, toNumber(payload.new_score, 0))),
      reason: normalizeReason(payload.reason),
      updated_at:
        typeof payload.updated_at === "string"
          ? payload.updated_at
          : typeof payload.timestamp === "string"
            ? payload.timestamp
            : new Date().toISOString(),
    }
  })
}

function normalizeTopClusters(raw: unknown): ClusterRiskItem[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      const payload = item as Record<string, unknown>
      const clusterId = typeof payload.cluster_id === "string" ? payload.cluster_id : ""
      return {
        cluster_id: clusterId,
        jobs_1h: Math.max(0, Math.floor(toNumber(payload.jobs_1h, 0))),
        jobs_6h: Math.max(0, Math.floor(toNumber(payload.jobs_6h, 0))),
        jobs_24h: Math.max(0, Math.floor(toNumber(payload.jobs_24h, 0))),
        pressure_score: Math.max(0, toNumber(payload.pressure_score, 0)),
        corrected_jobs: Math.max(0, Math.floor(toNumber(payload.corrected_jobs, 0))),
        peak_score: Math.max(0, Math.min(1, toNumber(payload.peak_score, 0))),
      }
    })
    .filter((item) => item.cluster_id.length > 0)
}

function normalizeClusterSpikes(raw: unknown): ClusterSpikeItem[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((item) => {
    const payload = item as Record<string, unknown>
    return {
      timestamp: typeof payload.timestamp === "string" ? payload.timestamp : "--:--",
      bucket_start: typeof payload.bucket_start === "string" ? payload.bucket_start : undefined,
      cluster_jobs: Math.max(0, Math.floor(toNumber(payload.cluster_jobs, 0))),
      corrections: Math.max(0, Math.floor(toNumber(payload.corrections, 0))),
    }
  })
}

function deriveTrendsFromJobs(raw: unknown): TrendItem[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const buckets = new Map<string, { total: number; fake: number }>()
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  for (const item of raw) {
    const payload = item as Record<string, unknown>
    const createdAtRaw = payload.created_at
    const createdAt = typeof createdAtRaw === "string" ? new Date(createdAtRaw) : null
    if (!createdAt || Number.isNaN(createdAt.getTime())) {
      continue
    }

    const key = formatter.format(createdAt)
    const current = buckets.get(key) ?? { total: 0, fake: 0 }
    const prediction = normalizePrediction(payload.prediction)

    current.total += 1
    if (prediction === "FAKE") {
      current.fake += 1
    }

    buckets.set(key, current)
  }

  return Array.from(buckets.entries()).map(([timestamp, value]) => ({
    timestamp,
    total_jobs: value.total,
    fake_jobs: value.fake,
    real_jobs: Math.max(value.total - value.fake, 0),
    throughput: value.total / 3600,
  }))
}

function normalizeStatus(raw: unknown): SystemStatus {
  const payload = (raw ?? {}) as Record<string, unknown>

  const kafka = typeof payload.kafka === "string" ? payload.kafka.toLowerCase() : "down"
  const spark = typeof payload.spark === "string" ? payload.spark.toLowerCase() : "down"
  const ml = typeof payload.ml === "string" ? payload.ml.toLowerCase() : "unloaded"
  const db = typeof payload.db === "string" ? payload.db.toLowerCase() : "down"

  return {
    kafka: kafka === "running" ? "running" : "down",
    spark:
      spark === "active"
        ? "active"
        : spark === "idle"
          ? "idle"
          : "down",
    ml: ml === "loaded" ? "loaded" : "unloaded",
    db: db === "connected" ? "connected" : db === "disconnected" ? "disconnected" : "down",
    degraded: Boolean(payload.degraded ?? false),
    processing_latency_ms: Math.max(0, toNumber(payload.processing_latency_ms, 0)),
    messages: Array.isArray(payload.messages)
      ? payload.messages.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined,
    checked_at: typeof payload.checked_at === "string" ? payload.checked_at : undefined,
    source: typeof payload.source === "string" ? payload.source : undefined,
    pipeline: typeof payload.pipeline === "string" ? payload.pipeline : undefined,
    mode:
      payload.mode === "normal" || payload.mode === "degraded" || payload.mode === "recovery"
        ? payload.mode
        : undefined,
  }
}

function normalizeSystemMetrics(raw: unknown): SystemMetrics {
  const payload = (raw ?? {}) as Record<string, unknown>
  return {
    throughput_jobs_per_sec: Math.max(0, toNumber(payload.throughput_jobs_per_sec, 0)),
    avg_latency_ms: Math.max(0, toNumber(payload.avg_latency_ms, 0)),
    error_rate: Math.max(0, Math.min(1, toNumber(payload.error_rate, 0))),
    fraud_rate: Math.max(0, Math.min(1, toNumber(payload.fraud_rate, 0))),
    anomaly_rate: Math.max(0, Math.min(1, toNumber(payload.anomaly_rate, 0))),
    kafka_lag: Math.max(0, Math.floor(toNumber(payload.kafka_lag, 0))),
    spark_batch_time_ms: Math.max(0, toNumber(payload.spark_batch_time_ms, 0)),
    db_insert_time_ms: Math.max(0, toNumber(payload.db_insert_time_ms, 0)),
    queue_backlog: Math.max(0, Math.floor(toNumber(payload.queue_backlog, 0))),
    samples: Math.max(0, Math.floor(toNumber(payload.samples, 0))),
    checked_at: typeof payload.checked_at === "string" ? payload.checked_at : undefined,
    window_minutes: Math.max(0, Math.floor(toNumber(payload.window_minutes, 0))),
  }
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null
  }

  return raw as Record<string, unknown>
}

function normalizeRealtimeSnapshotFromRecord(raw: Record<string, unknown>): RealtimeSnapshot {
  return {
    session_id: typeof raw.session_id === "string" ? raw.session_id : undefined,
    metrics: raw.metrics ? normalizeDashboardMetrics(raw.metrics) : undefined,
    system_metrics: raw.system_metrics ? normalizeSystemMetrics(raw.system_metrics) : undefined,
    alerts: raw.alerts ? normalizeAlerts(raw.alerts) : undefined,
    trends: raw.trends ? normalizeTrends(raw.trends) : undefined,
    corrections: raw.corrections ? normalizeCorrections(raw.corrections) : undefined,
    top_clusters: raw.top_clusters ? normalizeTopClusters(raw.top_clusters) : undefined,
    cluster_spikes: raw.cluster_spikes ? normalizeClusterSpikes(raw.cluster_spikes) : undefined,
    status: raw.status ? normalizeStatus(raw.status) : undefined,
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    pipeline: typeof raw.pipeline === "string" ? raw.pipeline : undefined,
    mode: typeof raw.mode === "string" ? raw.mode : undefined,
  }
}

function normalizePredictionStreamItem(raw: unknown): PredictionStreamItem | null {
  const payload = asRecord(raw)
  if (!payload) {
    return null
  }

  const jobId = typeof payload.job_id === "string" ? payload.job_id : ""
  if (!jobId) {
    return null
  }

  const title =
    typeof payload.title === "string"
      ? payload.title
      : typeof payload.job_title === "string"
        ? payload.job_title
        : "Untitled Posting"

  const confidence = normalizeConfidence(payload.confidence)
  const riskScore = normalizeConfidence(payload.risk_score ?? payload.updated_score ?? payload.confidence)

  return {
    id: typeof payload.id === "string" ? payload.id : jobId,
    job_id: jobId,
    title,
    prediction: normalizePrediction(payload.prediction ?? payload.label),
    confidence,
    risk_score: riskScore,
    reason: normalizeReason(payload.reason),
    timestamp:
      typeof payload.created_at === "string"
        ? payload.created_at
        : typeof payload.timestamp === "string"
          ? payload.timestamp
          : new Date().toISOString(),
    cluster_id: typeof payload.cluster_id === "string" ? payload.cluster_id : null,
    is_corrected: Boolean(payload.is_corrected ?? false),
    correction_reason: typeof payload.correction_reason === "string" ? payload.correction_reason : null,
  }
}

function normalizeRealtimeEvent(raw: unknown): RealtimeEvent | null {
  const message = asRecord(raw)
  if (!message) {
    return null
  }

  const timestamp = typeof message.timestamp === "string" ? message.timestamp : undefined
  const sessionId = typeof message.session_id === "string" ? message.session_id : undefined
  const source = typeof message.source === "string" ? message.source : undefined
  const pipeline = typeof message.pipeline === "string" ? message.pipeline : undefined
  const mode = typeof message.mode === "string" ? message.mode : undefined
  const eventTypeRaw = typeof message.type === "string" ? message.type.trim().toLowerCase() : ""
  const payload = "data" in message ? message.data : "payload" in message ? message.payload : undefined

  if (eventTypeRaw) {
    switch (eventTypeRaw) {
      case "snapshot": {
        const snapshotRecord = asRecord(payload)
        if (!snapshotRecord) {
          return null
        }
        const payloadSessionId = typeof snapshotRecord.session_id === "string" ? snapshotRecord.session_id : undefined
        return {
          type: "snapshot",
          session_id: sessionId ?? payloadSessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeRealtimeSnapshotFromRecord(snapshotRecord),
        }
      }
      case "stats":
        return {
          type: "stats",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeDashboardMetrics(payload),
        }
      case "system_metrics":
        return {
          type: "system_metrics",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeSystemMetrics(payload),
        }
      case "status":
        return {
          type: "status",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeStatus(payload),
        }
      case "alerts":
        return {
          type: "alerts",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeAlerts(payload),
        }
      case "alert": {
        const normalizedAlert = normalizeAlerts([payload])[0]
        if (!normalizedAlert) {
          return null
        }
        return {
          type: "alert",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizedAlert,
        }
      }
      case "prediction": {
        const prediction = normalizePredictionStreamItem(payload)
        if (!prediction) {
          return null
        }
        return {
          type: "prediction",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: prediction,
        }
      }
      case "new_prediction": {
        const prediction = normalizePredictionStreamItem(payload)
        if (!prediction) {
          return null
        }
        return {
          type: "new_prediction",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: prediction,
        }
      }
      case "new_alert": {
        const normalizedAlert = normalizeAlerts([payload])[0]
        if (!normalizedAlert) {
          return null
        }
        return {
          type: "new_alert",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizedAlert,
        }
      }
      case "trends":
        return {
          type: "trends",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeTrends(payload),
        }
      case "corrections":
        return {
          type: "corrections",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeCorrections(payload),
        }
      case "top_clusters":
        return {
          type: "top_clusters",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeTopClusters(payload),
        }
      case "cluster_spikes":
        return {
          type: "cluster_spikes",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: normalizeClusterSpikes(payload),
        }
      case "heartbeat": {
        const heartbeatPayload = asRecord(payload) ?? { status: "ok" }
        return {
          type: "heartbeat",
          session_id: sessionId,
          source,
          pipeline,
          mode,
          timestamp,
          payload: heartbeatPayload,
        }
      }
      default:
        break
    }
  }

  // Backward compatibility: treat unlabeled websocket messages as full snapshots.
  return {
    type: "snapshot",
    session_id: sessionId,
    source,
    pipeline,
    mode,
    payload: normalizeRealtimeSnapshotFromRecord(message),
    timestamp,
  }
}

export const analyzeJob = async (payload: AnalyzeJobPayload): Promise<AnalyzeJobResult> => {
  const raw = await requestJson<unknown>(
    ["/analyze"],
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        requirements: payload.requirements,
        company_info: payload.companyInfo,
      }),
    }
  )

  return normalizeAnalyzeResponse(raw)
}

export const getDashboardMetrics = async (): Promise<DashboardMetrics> => {
  const raw = await requestJson<unknown>(["/dashboard", "/stats"], { method: "GET" })
  return normalizeDashboardMetrics(raw)
}

export const getAlerts = async (): Promise<AlertItem[]> => {
  const raw = await requestJson<unknown>(["/alerts", "/jobs/fake?limit=25"], { method: "GET" })
  return normalizeAlerts(raw)
}

export const getTrends = async (): Promise<TrendItem[]> => {
  try {
    const raw = await requestJson<unknown>(["/trends"], { method: "GET" })
    return normalizeTrends(raw)
  } catch {
    const fallbackLimit = Number(200)
    const normalizedFallbackLimit = Number.isFinite(fallbackLimit) && fallbackLimit > 0
      ? Math.floor(fallbackLimit)
      : 50
    const fallbackRaw = await requestJson<unknown>(
      [`/jobs/latest?limit=${normalizedFallbackLimit}`],
      { method: "GET" }
    )
    return deriveTrendsFromJobs(fallbackRaw)
  }
}

export const getCorrections = async (): Promise<CorrectionItem[]> => {
  const raw = await requestJson<unknown>(["/corrections?limit=50"], { method: "GET" })
  return normalizeCorrections(raw)
}

export const getTopRiskClusters = async (): Promise<ClusterRiskItem[]> => {
  const raw = await requestJson<unknown>(["/clusters/top?limit=8"], { method: "GET" })
  return normalizeTopClusters(raw)
}

export const getClusterSpikes = async (): Promise<ClusterSpikeItem[]> => {
  const raw = await requestJson<unknown>(["/clusters/spikes?window_hours=24"], { method: "GET" })
  return normalizeClusterSpikes(raw)
}

export const getSystemStatus = async (): Promise<SystemStatus> => {
  try {
    const raw = await requestJson<unknown>(["/status"], { method: "GET" })
    return normalizeStatus(raw)
  } catch {
    return {
      kafka: "down",
      spark: "down",
      ml: "unloaded",
      db: "down",
      degraded: true,
      processing_latency_ms: 0,
      mode: "degraded",
      messages: ["Status endpoint unavailable - operating in degraded mode"],
    }
  }
}

export const getSystemMetrics = async (): Promise<SystemMetrics> => {
  try {
    const raw = await requestJson<unknown>(["/system-metrics"], { method: "GET" })
    return normalizeSystemMetrics(raw)
  } catch {
    return {
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
  }
}

export const getSystemStatusStrict = async (): Promise<SystemStatus> => {
  const raw = await requestJson<unknown>(["/status"], { method: "GET" }, { retries: 0, timeoutMs: 3000 })
  return normalizeStatus(raw)
}

export function connectRealtime(
  onEvent: (event: RealtimeEvent) => void,
  onStateChange?: (state: "connecting" | "open" | "closed" | "error") => void,
  options: RealtimeConnectionOptions = {}
): () => void {
  if (typeof window === "undefined") {
    return () => undefined
  }

  const {
    reconnect = true,
    reconnectBaseDelayMs = 700,
    maxReconnectDelayMs = 10000,
    maxReconnectAttempts = Number.POSITIVE_INFINITY,
  } = options

  const wsUrl = `${WS_BASE_URL.replace(/\/$/, "")}/ws`
  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let manuallyClosed = false
  let reconnectAttempts = 0

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (!reconnect || manuallyClosed) {
      return
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      onStateChange?.("closed")
      return
    }

    const delayMs = Math.min(maxReconnectDelayMs, reconnectBaseDelayMs * 2 ** reconnectAttempts)
    reconnectAttempts += 1
    console.info(`[WS] reconnect scheduled in ${delayMs}ms (attempt ${reconnectAttempts})`)
    clearReconnectTimer()
    reconnectTimer = window.setTimeout(() => {
      connect()
    }, delayMs)
  }

  const connect = () => {
    if (manuallyClosed) {
      return
    }

    clearReconnectTimer()
    onStateChange?.("connecting")
    console.info(`[WS] connecting to ${wsUrl}`)

    try {
      socket = new WebSocket(wsUrl)
    } catch (error) {
      console.warn("[WS] failed to create websocket", error)
      onStateChange?.("error")
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      reconnectAttempts = 0
      console.info("WS connected")
      onStateChange?.("open")
    }

    socket.onmessage = (event) => {
      let raw: unknown
      try {
        const text = typeof event.data === "string" ? event.data : String(event.data)
        raw = JSON.parse(text) as unknown
      } catch (error) {
        console.warn("[WS] failed to parse incoming JSON", error)
        onStateChange?.("error")
        return
      }

      const normalized = normalizeRealtimeEvent(raw)

      if (!normalized) {
        console.warn("[WS] dropped malformed realtime event", raw)
        return
      }

      onEvent(normalized)
    }

    socket.onerror = (event) => {
      const readyState = socket?.readyState
      const readyStateLabel =
        readyState === WebSocket.CONNECTING
          ? "CONNECTING"
          : readyState === WebSocket.OPEN
            ? "OPEN"
            : readyState === WebSocket.CLOSING
              ? "CLOSING"
              : readyState === WebSocket.CLOSED
                ? "CLOSED"
                : "UNKNOWN"

      // Browser WebSocket error events are intentionally sparse (often just {}).
      // Treat this as a transient transport signal and let onclose drive reconnect.
      console.warn(`[WS] socket transport warning (state=${readyStateLabel})`, event)
    }

    socket.onclose = (event) => {
      console.warn(`[WS] closed (code=${event.code}, reason=${event.reason || "n/a"})`)
      onStateChange?.("closed")
      socket = null
      scheduleReconnect()
    }
  }

  connect()

  return () => {
    manuallyClosed = true
    clearReconnectTimer()

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close()
    }
  }
}
