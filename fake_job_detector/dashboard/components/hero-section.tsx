"use client"

import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Activity, BarChart3, Cpu, Database, LayoutDashboard, Sparkles, Zap } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { JobInputPanel } from "@/components/job-input-panel"
import { useDashboard } from "@/context/dashboard-context"
import { cn } from "@/lib/utils"

interface LiveMetrics {
  jobsProcessed: number
  fakeDetected: number
  detectionRate: number
  avgConfidence: number
  throughput: number
  lastProcessedTimestamp: string
}

type PipelineStatus = {
  kafka: "Running" | "Down"
  spark: "Active" | "Idle" | "Down"
  ml: "Loaded" | "Down"
  database: "Connected" | "Disconnected"
}

type MiniVizKind = "stream" | "microbatch" | "classification" | "storage"

interface OverviewCard {
  title: string
  text: string
  icon: LucideIcon
}

interface ExplanationCard {
  title: string
  text: string
  kind: MiniVizKind
}

interface ArchitectureNode {
  label: string
  detail: string
}

const titleWords = ["Real-Time", "Fake", "Job", "Detection", "System"]

const initialMetrics: LiveMetrics = {
  jobsProcessed: 0,
  fakeDetected: 0,
  detectionRate: 0,
  avgConfidence: 0,
  throughput: 0,
  lastProcessedTimestamp: "--:--:--",
}

const tags = ["Real-Time", "ML Inference", "Kafka Streaming", "Spark Structured", "Low Latency"]

const motionEase = [0.23, 1, 0.32, 1] as const

const coreSpring = {
  stiffness: 120,
  damping: 20,
  mass: 0.9,
}

const hoverSpring = {
  stiffness: 120,
  damping: 20,
}

interface LivePipelineModule {
  key: string
  label: string
  detail: string
  icon: LucideIcon
}

const livePipelineModules: LivePipelineModule[] = [
  {
    key: "kafka",
    label: "Kafka",
    detail: "Event ingress",
    icon: Activity,
  },
  {
    key: "spark",
    label: "Spark",
    detail: "Stream compute",
    icon: Zap,
  },
  {
    key: "ml",
    label: "ML",
    detail: "Fraud scoring",
    icon: Cpu,
  },
  {
    key: "db",
    label: "DB",
    detail: "Persistent store",
    icon: Database,
  },
  {
    key: "dashboard",
    label: "Dashboard",
    detail: "Live intelligence",
    icon: LayoutDashboard,
  },
]

const heroParticleConfig = [
  { left: "7%", top: "20%", delay: 0.2, duration: 8.6, size: 5 },
  { left: "13%", top: "63%", delay: 0.7, duration: 10.4, size: 4 },
  { left: "19%", top: "40%", delay: 1.1, duration: 9.2, size: 3 },
  { left: "31%", top: "76%", delay: 1.8, duration: 11.2, size: 5 },
  { left: "44%", top: "28%", delay: 0.4, duration: 8.8, size: 4 },
  { left: "53%", top: "58%", delay: 1.3, duration: 12.1, size: 3 },
  { left: "64%", top: "18%", delay: 0.9, duration: 9.4, size: 4 },
  { left: "73%", top: "46%", delay: 0.1, duration: 10.8, size: 5 },
  { left: "82%", top: "70%", delay: 1.6, duration: 9.7, size: 4 },
  { left: "91%", top: "34%", delay: 0.6, duration: 11.5, size: 3 },
]

const systemOverviewCards: OverviewCard[] = [
  {
    title: "Real-time ingestion",
    text: "Kafka topic ingestion receives posting events continuously from distributed producers.",
    icon: Activity,
  },
  {
    title: "Stream processing",
    text: "Spark Structured Streaming normalizes and enriches incoming posting batches in-flight.",
    icon: Zap,
  },
  {
    title: "ML classification",
    text: "ML inference scores fraud likelihood with confidence outputs for each posting.",
    icon: Cpu,
  },
  {
    title: "Persistent storage",
    text: "PostgreSQL stores predictions and metadata for alerts, trends, and auditability.",
    icon: Database,
  },
  {
    title: "Visualization layer",
    text: "Operational dashboards expose throughput, detection behavior, and system health.",
    icon: BarChart3,
  },
]

const architectureNodes: ArchitectureNode[] = [
  {
    label: "Producer",
    detail: "Job records are emitted by the producer and serialized as streaming events.",
  },
  {
    label: "Kafka",
    detail: "Real-time ingestion using distributed partitions",
  },
  {
    label: "Spark Streaming",
    detail: "Structured Streaming executes transformations and enrichments in continuous micro-batches.",
  },
  {
    label: "ML Model",
    detail: "Model inference scores fraudulent behavior and confidence in near real-time.",
  },
  {
    label: "PostgreSQL",
    detail: "Predictions persist for investigation workflows, analytics, and longitudinal monitoring.",
  },
  {
    label: "Dashboard",
    detail: "Operational surface visualizes alerts, status, throughput, and detection rates.",
  },
]

const explanationCards: ExplanationCard[] = [
  {
    title: "Kafka Ingestion",
    text: "Real-time streaming ingestion from distributed producers with scalable, partitioned topics.",
    kind: "stream",
  },
  {
    title: "Spark Processing",
    text: "Structured Streaming executes micro-batch and low-latency transformations in one pipeline.",
    kind: "microbatch",
  },
  {
    title: "ML Engine",
    text: "TF-IDF feature extraction and classification produce confidence-based fraud scoring.",
    kind: "classification",
  },
  {
    title: "Database",
    text: "Persistent prediction storage enables queryable historical analysis and operational dashboards.",
    kind: "storage",
  },
]

const sectionTransition = {
  duration: 0.52,
  ease: motionEase,
}

function AnimatedValue({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
}) {
  const [display, setDisplay] = useState(0)
  const previousValueRef = useRef(0)

  useEffect(() => {
    const startValue = previousValueRef.current
    const delta = value - startValue
    const durationMs = 850
    let frameId = 0
    const startTime = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = startValue + delta * eased
      setDisplay(nextValue)

      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      } else {
        previousValueRef.current = value
      }
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [value])

  const normalized = decimals === 0 ? Math.round(display) : Number(display.toFixed(decimals))
  const formatted = normalized.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span className="font-mono font-semibold tracking-tight">
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 160
  const height = 42
  const max = Math.max(...values)
  const min = Math.min(...values)
  const spread = max - min || 1

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / spread) * (height - 6) - 3
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")

  return (
    <svg className="h-11 w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke="rgba(156, 163, 175, 0.22)" strokeWidth="1" />
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </svg>
  )
}

function MagneticPrimaryButton({
  onClick,
  reducedMotion,
}: {
  onClick: () => void
  reducedMotion: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const handleMove = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }

    const normalizedX = (event.clientX - rect.left) / rect.width - 0.5
    const normalizedY = (event.clientY - rect.top) / rect.height - 0.5
    setOffset({
      x: normalizedX * 18,
      y: normalizedY * 12,
    })
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setIsPressed(false)
        setOffset({ x: 0, y: 0 })
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onBlur={() => {
        setIsPressed(false)
        setOffset({ x: 0, y: 0 })
      }}
      animate={{ x: offset.x, y: offset.y }}
      transition={{ type: "spring", ...hoverSpring }}
      whileHover={reducedMotion ? undefined : { scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      className="group relative isolate overflow-hidden rounded-2xl border border-[rgba(0,255,166,0.6)] bg-[linear-gradient(118deg,#00ff9f_0%,#00ffa6_48%,#22ff88_100%)] px-6 py-3 text-sm font-semibold tracking-[0.02em] text-[#000000]"
      style={{ boxShadow: "0 0 24px rgba(0, 255, 150, 0.32)", willChange: "transform" }}
    >
      <motion.span
        className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ecfff7]/55"
        animate={isHovered ? { scale: [0.8, 2.5], opacity: [0.45, 0] } : { scale: 0.5, opacity: 0 }}
        transition={{ duration: 0.75, ease: motionEase }}
      />

      <span className="pointer-events-none absolute inset-y-0 -left-[45%] w-[42%] -translate-x-[130%] bg-gradient-to-r from-transparent via-[#f7fffc]/65 to-transparent mix-blend-screen transition-transform duration-500 group-hover:translate-x-[230%]" />

      <motion.span
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[#baffdf]/30"
        animate={isPressed ? { scale: [1, 1.4], opacity: [0.55, 0] } : { scale: 1, opacity: 0 }}
        transition={{ duration: 0.35, ease: motionEase }}
      />

      <motion.span
        animate={reducedMotion ? { y: 0 } : { y: [-1.5, 1.5, -1.5] }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: 4.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
        }
        className="relative z-10"
      >
        Try Live Detection
      </motion.span>
    </motion.button>
  )
}

function HeroPipelineVisual({
  scrollProgress,
  reducedMotion,
}: {
  scrollProgress: number
  reducedMotion: boolean
}) {
  const [activeNodeIndex, setActiveNodeIndex] = useState(0)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [pointerX, setPointerX] = useState<number | null>(null)
  const pointerFrameRef = useRef<number | null>(null)
  const pendingPointerRef = useRef<number | null>(null)

  useEffect(() => {
    if (reducedMotion) {
      return
    }

    const intervalId = setInterval(() => {
      setActiveNodeIndex((prev) => (prev + 1) % livePipelineModules.length)
    }, 1800)

    return () => clearInterval(intervalId)
  }, [reducedMotion])

  useEffect(() => {
    return () => {
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current)
      }
    }
  }, [])

  const panelScale = 1 - scrollProgress * 0.08

  const handlePointerMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) {
      return
    }

    const normalizedX = (event.clientX - rect.left) / rect.width
    pendingPointerRef.current = Math.max(0, Math.min(1, normalizedX))

    if (pointerFrameRef.current !== null) {
      return
    }

    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null
      setPointerX(pendingPointerRef.current)
    })
  }

  const getProximity = (index: number) => {
    if (pointerX === null) {
      return 0
    }

    const anchor = (index + 0.5) / livePipelineModules.length
    return Math.max(0, 1 - Math.abs(pointerX - anchor) / 0.28)
  }

  return (
    <motion.div
      onMouseMove={handlePointerMove}
      onMouseLeave={() => {
        if (pointerFrameRef.current !== null) {
          cancelAnimationFrame(pointerFrameRef.current)
          pointerFrameRef.current = null
        }
        pendingPointerRef.current = null
        setPointerX(null)
        setHoveredNode(null)
      }}
      style={{ scale: panelScale, willChange: "transform" }}
      className="relative overflow-hidden rounded-[30px] border border-[rgba(0,255,150,0.24)] bg-[rgba(0,20,10,0.4)] p-5 shadow-[0_0_60px_rgba(0,255,150,0.15)] sm:p-6"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(76,255,173,0.2)_0%,transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_82%,rgba(76,255,173,0.14)_0%,transparent_52%)]" />

      <motion.div
        className="pointer-events-none absolute left-[-35%] top-1/2 h-[2px] w-[170%]"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,255,150,0.88), transparent)" }}
        animate={
          reducedMotion
            ? { x: "0%", opacity: 0.2 }
            : { x: ["-8%", "12%"], opacity: [0, 0.78, 0] }
        }
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }
        }
      />

      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:repeating-linear-gradient(0deg,rgba(138,255,196,0.07)_0,rgba(138,255,196,0.07)_1px,transparent_1px,transparent_6px)]" />

      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f3fff8]">Neural Stream Panel</p>
        <p className="mt-2 text-xs text-[#9ca3af]">Kafka -&gt; Spark -&gt; ML -&gt; DB -&gt; Dashboard</p>

        <div className="mt-6 overflow-x-auto pb-2">
          <div className="relative flex min-w-[760px] items-center gap-2.5 pr-1">
            {livePipelineModules.map((node, index) => {
              const proximity = getProximity(index)
              const isActive = activeNodeIndex === index
              const isInteractive = hoveredNode === node.key || proximity > 0.66
              const intensity = 0.84 + proximity * 0.16

              return (
                <Fragment key={node.key}>
                  <motion.button
                    type="button"
                    onMouseEnter={() => setHoveredNode(node.key)}
                    onMouseLeave={() => setHoveredNode(null)}
                    whileHover={reducedMotion ? undefined : { scale: 1.03, transition: { type: "spring", ...hoverSpring } }}
                    className={cn(
                      "group relative w-[132px] shrink-0 overflow-hidden rounded-2xl border bg-[linear-gradient(145deg,rgba(0,18,11,0.72),rgba(5,5,5,0.9))] px-3 py-3 text-left",
                      isActive || isInteractive
                        ? "border-[rgba(0,255,166,0.7)] shadow-[0_0_20px_rgba(0,255,150,0.28)]"
                        : "border-[rgba(0,255,150,0.3)]"
                    )}
                    style={{ opacity: intensity }}
                    animate={reducedMotion ? { y: 0, scale: 1 } : { y: isActive ? -2 : 0, scale: isInteractive ? 1.02 : 1 }}
                    transition={{ type: "spring", ...coreSpring }}
                  >
                    <div className="flex items-center gap-2 text-[#d4ffe9]">
                      <span className="rounded-lg border border-[rgba(0,255,150,0.35)] bg-[rgba(0,26,14,0.65)] p-1.5">
                        <node.icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[11px] font-semibold tracking-[0.12em] text-[#f3fff8]">{node.label}</span>
                    </div>

                    <p className="mt-2 text-[11px] text-[#9ca3af]">{node.detail}</p>

                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#71ffbf1c]">
                      <span
                        className={cn(
                          "block h-full rounded-full bg-gradient-to-r from-transparent via-[#9dffd7] to-transparent",
                          isActive ? "w-full opacity-100" : "w-10 opacity-50"
                        )}
                      />
                    </div>
                  </motion.button>

                  {index < livePipelineModules.length - 1 && (
                    <div className="relative h-[2px] min-w-12 flex-1 overflow-hidden">
                      <div className="absolute inset-0 bg-[rgba(0,255,150,0.25)]" />
                      <motion.div
                        className="absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-transparent via-[#9affd4] to-transparent"
                        animate={
                          reducedMotion
                            ? { opacity: activeNodeIndex === index ? 0.8 : 0 }
                            : {
                                x: activeNodeIndex === index ? ["-35%", "135%"] : "-35%",
                                opacity: activeNodeIndex === index ? [0, 1, 0] : 0,
                              }
                        }
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { duration: 1.6, repeat: activeNodeIndex === index ? Number.POSITIVE_INFINITY : 0, ease: "linear" }
                        }
                      />
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ActivityBars({ healthy }: { healthy: boolean }) {
  const barColor = healthy ? "#00ffa6" : "#ef4444"
  const heights = healthy ? [7, 11, 8, 13, 9, 12, 8, 10] : [5, 7, 6, 8, 6, 7, 5, 6]

  return (
    <div className="flex items-end gap-1">
      {heights.map((height, index) => (
        <span
          key={`activity-bar-${index}`}
          className="w-[3px] rounded-sm"
          style={{
            backgroundColor: barColor,
            height,
            opacity: healthy ? 0.85 : 0.62,
          }}
        />
      ))}
    </div>
  )
}

function PipelineMiniViz({ kind }: { kind: MiniVizKind }) {
  if (kind === "stream") {
    return (
      <div className="relative h-24 overflow-hidden rounded-xl border border-[#00ff9f40] bg-[#050505d9]">
        <div className="absolute inset-x-4 top-1/2 h-[2px] -translate-y-1/2 bg-[#00ff9f33]" />
        <span className="absolute left-[14%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#00ffa6]" />
        <span className="absolute left-[46%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#00ffa6] opacity-80" />
        <span className="absolute right-[14%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#00ffa6] opacity-65" />
      </div>
    )
  }

  if (kind === "microbatch") {
    return (
      <div className="relative h-24 overflow-hidden rounded-xl border border-[#00ff9f40] bg-[#050505d9] px-4 py-3">
        <div className="flex h-full items-center gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`batch-block-${index}`}
              className="h-8 w-6 rounded-md bg-[#00ff9f66]"
              style={{ opacity: 0.5 + (index % 3) * 0.12 }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (kind === "classification") {
    return (
      <div className="relative h-24 overflow-hidden rounded-xl border border-[#00ff9f40] bg-[#050505d9] px-4 py-3">
        <div className="grid h-full grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#00ff9f44] bg-[#05261a]" />
          <div className="rounded-lg border border-[#ef444455] bg-[#2f0e14]" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-24 overflow-hidden rounded-xl border border-[#00ff9f40] bg-[#050505d9] px-4 py-3">
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`stack-row-${index}`}
            className="h-3 rounded-md bg-gradient-to-r from-[#22ff8899] to-[#00ffa6aa]"
            style={{ opacity: 0.55 + index * 0.08 }}
          />
        ))}
      </div>
    </div>
  )
}

export function HeroSection() {
  const router = useRouter()
  const prefersReducedMotion = useReducedMotion()
  const reducedMotion = Boolean(prefersReducedMotion)
  const { totalJobs, fakeJobs, fakePercentage, throughput, avgConfidence, trends, systemStatus, isRunning } = useDashboard()

  const [activeArchitectureNode, setActiveArchitectureNode] = useState("Kafka")

  const metrics = useMemo<LiveMetrics>(() => {
    const latestTimestamp = trends[trends.length - 1]?.timestamp ?? initialMetrics.lastProcessedTimestamp

    return {
      jobsProcessed: totalJobs,
      fakeDetected: fakeJobs,
      detectionRate: Number(fakePercentage.toFixed(1)),
      avgConfidence: Number((avgConfidence * 100).toFixed(1)),
      throughput: Number(throughput.toFixed(2)),
      lastProcessedTimestamp: latestTimestamp,
    }
  }, [avgConfidence, fakeJobs, fakePercentage, throughput, totalJobs, trends])

  const status = useMemo<PipelineStatus>(
    () => ({
      kafka: systemStatus.kafka === "running" ? "Running" : "Down",
      spark:
        systemStatus.spark === "active"
            ? "Active"
            : systemStatus.spark === "idle"
              ? "Idle"
              : "Down",
      ml: systemStatus.ml === "loaded" ? "Loaded" : "Down",
      database:
        systemStatus.database === "connected"
            ? "Connected"
            : "Disconnected",
    }),
    [systemStatus.database, systemStatus.kafka, systemStatus.ml, systemStatus.spark]
  )

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const metricSeries = useMemo(
    () => {
      const points = trends.slice(-6)
      if (points.length === 0) {
        return {
          jobsProcessed: [metrics.jobsProcessed],
          fakeDetected: [metrics.fakeDetected],
          throughput: [metrics.throughput],
          detectionRate: [metrics.detectionRate],
        }
      }

      return {
        jobsProcessed: points.map((point) => point.totalJobs),
        fakeDetected: points.map((point) => point.fakeJobs),
        throughput: points.map((point) => Number(point.throughput.toFixed(2))),
        detectionRate: points.map((point) => Number(((point.fakeJobs / Math.max(point.totalJobs, 1)) * 100).toFixed(1))),
      }
    },
    [metrics.detectionRate, metrics.fakeDetected, metrics.jobsProcessed, metrics.throughput, trends]
  )

  const activeArchitecture =
    architectureNodes.find((node) => node.label === activeArchitectureNode) ?? architectureNodes[1]

  const statusItems = [
    { label: "Kafka Broker", state: status.kafka },
    { label: "Spark Streaming", state: status.spark },
    { label: "ML Model", state: status.ml },
    { label: "PostgreSQL", state: status.database },
  ]

  const metricCards = [
    {
      id: "jobs",
      title: "Jobs Processed",
      value: metrics.jobsProcessed,
      content: <AnimatedValue value={metrics.jobsProcessed} />,
      spark: metricSeries.jobsProcessed,
      color: "#00ffa6",
    },
    {
      id: "fake",
      title: "Fake Detected",
      value: metrics.fakeDetected,
      content: <AnimatedValue value={metrics.fakeDetected} />,
      spark: metricSeries.fakeDetected,
      color: "#ef4444",
    },
    {
      id: "throughput",
      title: "Throughput",
      value: metrics.throughput,
      content: <AnimatedValue value={metrics.throughput} suffix=" jobs/s" />,
      spark: metricSeries.throughput,
      color: "#00ff9f",
    },
    {
      id: "rate",
      title: "Detection Rate",
      value: metrics.detectionRate,
      content: <AnimatedValue value={metrics.detectionRate} decimals={1} suffix="%" />,
      spark: metricSeries.detectionRate,
      color: "#00ffa6",
    },
  ]

  const heroSceneRef = useRef<HTMLElement | null>(null)
  const [heroCursorActive, setHeroCursorActive] = useState(false)
  const [heroScrollProgress, setHeroScrollProgress] = useState(0)
  const pointerFrameRef = useRef<number | null>(null)
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null)
  const scrollFrameRef = useRef<number | null>(null)

  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothPointerX = useSpring(pointerX, coreSpring)
  const smoothPointerY = useSpring(pointerY, coreSpring)

  const leftParallaxX = useTransform(smoothPointerX, [-0.5, 0.5], [-16, 16])
  const leftParallaxY = useTransform(smoothPointerY, [-0.5, 0.5], [-10, 10])
  const rightParallaxX = useTransform(smoothPointerX, [-0.5, 0.5], [18, -18])
  const rightParallaxY = useTransform(smoothPointerY, [-0.5, 0.5], [12, -12])
  const heroRotateX = useTransform(smoothPointerY, [-0.5, 0.5], [4, -4])
  const heroRotateY = useTransform(smoothPointerX, [-0.5, 0.5], [-6, 6])
  const heroGlowX = useTransform(smoothPointerX, [-0.5, 0.5], [-220, 220])
  const heroGlowY = useTransform(smoothPointerY, [-0.5, 0.5], [-160, 170])
  const pageParallaxX = useTransform(smoothPointerX, [-0.5, 0.5], [-4, 4])
  const pageParallaxY = useTransform(smoothPointerY, [-0.5, 0.5], [-3, 3])

  const heroContentScrollOffset = -heroScrollProgress * 26
  const heroPipelineScrollOffset = -heroScrollProgress * 40
  const heroPipelineScale = 1 - heroScrollProgress * 0.08
  const heroBackgroundShift = heroScrollProgress * 24

  useEffect(() => {
    const updateProgress = () => {
      scrollFrameRef.current = null
      const heroNode = heroSceneRef.current
      if (!heroNode) {
        return
      }

      const rect = heroNode.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height, 1)))
      setHeroScrollProgress(progress)
    }

    const requestProgressUpdate = () => {
      if (scrollFrameRef.current !== null) {
        return
      }

      scrollFrameRef.current = requestAnimationFrame(updateProgress)
    }

    updateProgress()

    window.addEventListener("scroll", requestProgressUpdate, { passive: true })
    window.addEventListener("resize", requestProgressUpdate)

    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }
      window.removeEventListener("scroll", requestProgressUpdate)
      window.removeEventListener("resize", requestProgressUpdate)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current)
      }
    }
  }, [])

  const handleHeroPointerMove = (event: ReactMouseEvent<HTMLElement>) => {
    if (prefersReducedMotion) {
      return
    }

    if (typeof window === "undefined" || window.innerWidth === 0 || window.innerHeight === 0) {
      return
    }

    const normalizedX = event.clientX / window.innerWidth - 0.5
    const normalizedY = event.clientY / window.innerHeight - 0.5

    pendingPointerRef.current = {
      x: Math.max(-0.5, Math.min(0.5, normalizedX)),
      y: Math.max(-0.5, Math.min(0.5, normalizedY)),
    }

    if (pointerFrameRef.current !== null) {
      return
    }

    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null
      if (!pendingPointerRef.current) {
        return
      }

      pointerX.set(pendingPointerRef.current.x)
      pointerY.set(pendingPointerRef.current.y)
    })

    if (!heroCursorActive) {
      setHeroCursorActive(true)
    }
  }

  const handleHeroPointerLeave = () => {
    if (pointerFrameRef.current !== null) {
      cancelAnimationFrame(pointerFrameRef.current)
      pointerFrameRef.current = null
    }
    pendingPointerRef.current = null
    setHeroCursorActive(false)
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <motion.div
      className="relative z-10 space-y-0"
      onMouseMove={handleHeroPointerMove}
      onMouseLeave={handleHeroPointerLeave}
      style={{ x: pageParallaxX, y: pageParallaxY }}
    >
      <motion.section
        ref={heroSceneRef}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: motionEase }}
        className="relative isolate min-h-screen overflow-hidden px-4 pt-24 pb-16 sm:px-6 sm:pt-28"
      >
        <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#000000_0%,#020202_48%,#000000_100%)]" />

          <motion.div
            className="absolute -bottom-52 left-1/2 h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(28,255,149,0.35)_0%,rgba(28,255,149,0.15)_40%,transparent_70%)]"
            style={{ y: heroBackgroundShift }}
            animate={prefersReducedMotion ? undefined : { opacity: [0.64, 0.92, 0.64], scale: [0.98, 1.03, 0.98] }}
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: 12, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
            }
          />

          <div
            className="absolute left-[42%] top-[18%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(36,255,152,0.24)_0%,transparent_70%)]"
            style={{ transform: `translateY(${-heroBackgroundShift * 0.4}px)` }}
          />

          <div className="absolute -left-24 top-[16%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(113,255,195,0.28)_0%,transparent_72%)]" />

          <div className="absolute -right-24 bottom-[14%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(86,255,181,0.24)_0%,transparent_72%)]" />

          <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(91,255,174,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(91,255,174,0.11)_1px,transparent_1px)] [background-size:58px_58px]" />

          <div className="absolute inset-0 opacity-[0.11] [background-image:radial-gradient(circle_at_20%_40%,rgba(117,255,192,0.26)_0%,transparent_24%),repeating-radial-gradient(circle_at_72%_32%,rgba(117,255,192,0.08)_0px,rgba(117,255,192,0.08)_2px,transparent_2px,transparent_18px)]" />

          <div className="absolute inset-0 opacity-[0.06] mix-blend-screen [background-image:radial-gradient(rgba(176,255,217,0.24)_1px,transparent_1px)] [background-size:3px_3px]" />

          {heroParticleConfig.slice(0, 10).map((particle, index) => (
            <span
              key={`hero-particle-static-${particle.left}-${index}`}
              className="absolute rounded-full bg-[#92ffd3]"
              style={{
                left: particle.left,
                top: particle.top,
                width: particle.size,
                height: particle.size,
                opacity: 0.35,
              }}
            />
          ))}

          <motion.div
            className="absolute left-[-30%] top-[36%] h-px w-[52%] bg-gradient-to-r from-transparent via-[#82ffc9]/75 to-transparent"
            animate={
              prefersReducedMotion
                ? { opacity: 0.2 }
                : { x: ["0%", "260%"], opacity: [0, 0.65, 0] }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 9, repeat: Number.POSITIVE_INFINITY, repeatDelay: 5.2, ease: "linear" }
            }
          />

          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(1,4,13,0.76)_100%)]" />
        </div>

        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(55,255,157,0.32)_0%,rgba(55,255,157,0.1)_46%,transparent_72%)]"
          style={{ x: heroGlowX, y: heroGlowY, opacity: heroCursorActive ? 0.95 : 0.48 }}
          animate={prefersReducedMotion ? { scale: 1 } : undefined}
          transition={prefersReducedMotion ? { duration: 0 } : undefined}
        />

        <div className="mx-auto flex min-h-[82vh] max-w-7xl items-center">
          <div className="grid w-full gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <motion.div style={{ y: heroContentScrollOffset }}>
              <motion.div
                style={{ x: leftParallaxX, y: leftParallaxY }}
                className="relative z-10 space-y-8"
              >
                <div className="space-y-4">
                  <h1
                    className="text-balance text-4xl font-black leading-[0.95] tracking-[-0.04em] text-[#ffffff] sm:text-6xl lg:text-7xl"
                    style={{ textShadow: "0 0 20px rgba(0,255,150,0.15)" }}
                  >
                    {titleWords.map((word, index) => (
                      <motion.span
                        key={word}
                        initial={{ opacity: 0, y: 26 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 * index, duration: 0.72, ease: motionEase }}
                        className="mr-3 inline-block"
                      >
                        {word}
                      </motion.span>
                    ))}
                  </h1>

                  <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.72, duration: 0.62, ease: motionEase }}
                    className="max-w-2xl text-sm leading-relaxed text-[#9ca3af] sm:text-base"
                  >
                    {isRunning
                      ? "A live intelligence layer that ingests, scores, and visualizes fraud signals across streaming job data in milliseconds."
                      : "Jump to Test the System to run live job detection from this page."}
                  </motion.p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {tags.map((tag, index) => (
                    <motion.div
                      key={tag}
                      initial={{ opacity: 0, scale: 0.72, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: 0.82 + index * 0.06, type: "spring", ...coreSpring }}
                    >
                      <span className="neon-badge relative inline-flex rounded-full border border-[#66ffbb66] bg-[linear-gradient(130deg,rgba(40,255,161,0.17),rgba(5,28,21,0.55))] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d1d5db]">
                        {tag}
                      </span>
                    </motion.div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {isRunning ? (
                    <MagneticPrimaryButton onClick={() => scrollToSection("live-detection")} reducedMotion={reducedMotion} />
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        scrollToSection("live-detection")
                      }}
                      className="ripple-button rounded-2xl border border-[#00ffa6aa] bg-gradient-to-r from-[#22ff88] via-[#00ff9f] to-[#00ffa6] px-5 py-3 text-[#000000] shadow-[0_0_24px_rgba(0,255,150,0.3)]"
                    >
                      Check Now
                    </Button>
                  )}

                  <motion.button
                    type="button"
                    onClick={() => scrollToSection("architecture")}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", ...hoverSpring }}
                    className="group relative overflow-hidden rounded-2xl border border-[#4df9ac55] bg-[rgba(4,21,17,0.55)] px-5 py-3 text-sm font-semibold tracking-[0.02em] text-[#d1d5db]"
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-[102%] bg-[linear-gradient(120deg,rgba(62,255,173,0.2),rgba(62,255,173,0.02))] transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0" />
                    <span className="relative z-10">View System Flow</span>
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              style={{
                x: rightParallaxX,
                y: rightParallaxY,
                rotateX: heroRotateX,
                rotateY: heroRotateY,
                transformPerspective: 1400,
              }}
              className="relative z-10 [transform-style:preserve-3d]"
            >
              <motion.div style={{ y: heroPipelineScrollOffset, scale: heroPipelineScale }}>
                <HeroPipelineVisual scrollProgress={heroScrollProgress} reducedMotion={reducedMotion} />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-2xl font-semibold text-[#ffffff] sm:text-3xl">The Problem</h2>
          <p className="max-w-4xl text-sm leading-relaxed text-[#9ca3af] sm:text-base">
            Fake job postings are increasing rapidly. Users cannot manually verify authenticity at scale, and
            traditional systems remain static, delayed, and operationally blind to live fraud patterns.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <motion.div
              whileHover={{ y: -4, scale: 1.01 }}
              className="neon-card rounded-2xl p-5"
            >
              <p className="text-xs text-[#9ca3af]">Fraudulent listings in sampled streams</p>
              <p className="mt-2 text-2xl text-[#ef4444]">
                {isRunning ? <AnimatedValue value={metrics.detectionRate} decimals={1} suffix="%" /> : "-"}
              </p>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, scale: 1.01 }}
              className="neon-card rounded-2xl p-5"
            >
              <p className="text-xs text-[#9ca3af]">Processed postings</p>
              <p className="mt-2 text-2xl text-[#d8fbe3]">
                {isRunning ? <AnimatedValue value={metrics.jobsProcessed} /> : "-"}
              </p>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, scale: 1.01 }}
              className="neon-card rounded-2xl p-5"
            >
              <p className="text-xs text-[#9ca3af]">Live throughput</p>
              <p className="mt-2 text-2xl text-[#d8fbe3]">
                {isRunning ? <AnimatedValue value={metrics.throughput} decimals={2} suffix=" jobs/s" /> : "-"}
              </p>
            </motion.div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-2xl font-semibold text-[#ffffff] sm:text-3xl">What We Built</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {systemOverviewCards.map((item, index) => (
              <motion.div
                key={item.title}
                whileHover={{ scale: 1.02, y: -3 }}
                transition={{ duration: 0.22 }}
                className="neon-card rounded-2xl p-5"
              >
                <div className="mb-3 inline-flex rounded-xl border border-[#00ff9f55] bg-[#050505cc] p-2 text-[#00ffa6]">
                  <item.icon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-[#ffffff]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">{item.text}</p>
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08, duration: 0.52, ease: "easeOut" }}
                  className="mt-4 h-[2px] origin-left bg-gradient-to-r from-[#00ff9f] to-transparent"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section
        id="architecture"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-2xl font-semibold text-[#ffffff] sm:text-3xl">System Architecture</h2>

          <div className="neon-card overflow-hidden rounded-3xl p-5 sm:p-7">
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max items-center gap-2">
                {architectureNodes.map((node, index) => (
                  <Fragment key={node.label}>
                    <motion.button
                      type="button"
                      onClick={() => setActiveArchitectureNode(node.label)}
                      onMouseEnter={() => setActiveArchitectureNode(node.label)}
                      onFocus={() => setActiveArchitectureNode(node.label)}
                      whileHover={{ y: -2, scale: 1.02 }}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                        activeArchitectureNode === node.label
                          ? "border-[#00ffa6cc] bg-[#0a3122cc] text-[#ffffff]"
                          : "border-[#00ff9f55] bg-[#050505cc] text-[#9fceb0] hover:border-[#00ffa6aa]"
                      )}
                    >
                      {node.label}
                    </motion.button>

                    {index < architectureNodes.length - 1 && (
                      <div className="relative h-[2px] min-w-10 flex-1 overflow-hidden bg-[#00ff9f33]">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          whileInView={{ scaleX: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.5, delay: index * 0.06, ease: "easeOut" }}
                          className="absolute inset-0 origin-left bg-gradient-to-r from-[#22ff88] to-[#00ffa6]"
                        />
                        <motion.span
                          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#00ffa6]"
                          animate={prefersReducedMotion ? { x: "50%", opacity: 0.75 } : { x: ["-10%", "110%"], opacity: [0, 1, 0] }}
                          transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.4, ease: "linear", delay: index * 0.1 }}
                        />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>

            <motion.div
              key={activeArchitectureNode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="mt-6 rounded-2xl border border-[#00ffa666] bg-[#050505cc] p-4"
            >
              <div className="mb-2 inline-flex items-center gap-2 text-[#00ffa6]">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold tracking-wide">Node Detail</span>
              </div>
              <p className="text-sm text-[#d1d5db]">
                <span className="font-semibold text-[#ffffff]">{activeArchitecture.label}:</span> {activeArchitecture.detail}
              </p>
            </motion.div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-2xl font-semibold text-[#ffffff] sm:text-3xl">Pipeline Explanation</h2>

          <div className="space-y-4">
            {explanationCards.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.36 }}
                transition={{ duration: 0.46, delay: index * 0.08, ease: motionEase }}
                whileHover={{ y: -3, scale: 1.01 }}
                className="neon-card grid gap-4 rounded-3xl p-5 md:grid-cols-[1.2fr_0.8fr] md:items-center"
              >
                <div>
                  <p className="text-xs font-mono text-[#9ca3af]">Step {index + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold text-[#ffffff]">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">{card.text}</p>
                </div>
                <PipelineMiniViz kind={card.kind} />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-2xl font-semibold text-[#ffffff] sm:text-3xl">Live System Metrics</h2>

          {!isRunning ? (
            <div className="neon-card rounded-2xl p-4 text-sm text-[#9ca3af]">
              No live metrics yet. Start the pipeline to activate telemetry.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metricCards.map((card) => (
                <motion.div
                  key={`${card.id}-${card.value}`}
                  whileHover={{ y: -4, scale: 1.01 }}
                  transition={{ type: "spring", ...hoverSpring }}
                  className="neon-card rounded-2xl p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs text-[#9ca3af]">{card.title}</p>
                    <span className={cn("h-2 w-2 rounded-full", card.id === "fake" ? "bg-[#ef4444]" : "bg-[#00ffa6]")} />
                  </div>
                  <p className={cn("text-xl", card.id === "fake" ? "text-[#ef4444]" : "text-[#ffffff]")}>{card.content}</p>
                  <div className="mt-3">
                    <Sparkline values={card.spark} color={card.color} />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.section>

      <motion.section
        id="live-detection"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-2xl font-semibold text-[#ffffff] sm:text-3xl">Test the System</h2>
          <p className="text-sm text-[#9ca3af] sm:text-base">Submit a job posting and analyze it in real time.</p>

          <div className="max-w-4xl">
            <JobInputPanel />
          </div>
        </div>
      </motion.section>

      <motion.section
        id="live-status"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-2xl font-semibold text-[#ffffff] sm:text-3xl">System Status</h2>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <div className="neon-card rounded-2xl p-5 sm:p-6">
              <div className="space-y-3">
                {statusItems.map((item) => {
                  const healthy =
                    item.state === "Running" ||
                    item.state === "Active" ||
                    item.state === "Loaded" ||
                    item.state === "Connected"

                  return (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#00ff9f30] bg-[#050505cc] p-3"
                    >
                      <span className="text-sm text-[#9ca3af]">{item.label}</span>
                      <div className="flex items-center gap-3">
                        <ActivityBars healthy={healthy} />
                        <span className={cn("h-2.5 w-2.5 rounded-full", healthy ? "bg-[#00ffa6]" : "bg-[#ef4444]")} />
                        <motion.span
                          key={`${item.label}-${item.state}`}
                          initial={{ opacity: 0.45 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className={cn("text-sm font-mono", healthy ? "text-[#00ffa6]" : "text-[#ef4444]")}
                        >
                          {item.state}
                        </motion.span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="neon-card space-y-3 rounded-2xl p-5 text-sm font-mono sm:p-6">
              <div className="flex items-center justify-between">
                <span className="text-[#9ca3af]">Jobs Processed</span>
                <span className="text-[#ffffff]">{isRunning ? metrics.jobsProcessed.toLocaleString("en-US") : "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#9ca3af]">Fake Jobs Detected</span>
                <span className="text-[#ef4444]">{isRunning ? metrics.fakeDetected.toLocaleString("en-US") : "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#9ca3af]">Throughput</span>
                <span className="text-[#ffffff]">{isRunning ? `${metrics.throughput} jobs/sec` : "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#9ca3af]">Detection Rate</span>
                <span className="text-[#ffffff]">{isRunning ? `${metrics.detectionRate.toFixed(1)}%` : "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#9ca3af]">Average Confidence</span>
                <span className="text-[#00ffa6]">{isRunning ? `${metrics.avgConfidence.toFixed(1)}%` : "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#9ca3af]">Last Processed Timestamp</span>
                <span className="text-[#ffffff]">{isRunning ? metrics.lastProcessedTimestamp : "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.24 }}
        transition={sectionTransition}
        className="border-t border-[#00ff9f2e] px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-7xl">
          <motion.div
            className="relative overflow-hidden rounded-3xl border border-[#00ffa6aa] bg-gradient-to-r from-[#020202] via-[#042612] to-[#020202] p-8 text-center sm:p-12"
            style={{ backgroundSize: "220% 220%" }}
          >
            <div className="pointer-events-none absolute -left-24 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.42)_0%,transparent_70%)]" />
            <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(0,255,150,0.35)_0%,transparent_70%)]" />

            <div className="relative z-10 space-y-4">
              <h2 className="text-3xl font-semibold tracking-tight text-[#ffffff] sm:text-4xl">
                Explore Full System Analytics
              </h2>
              <p className="mx-auto max-w-2xl text-sm text-[#9ca3af] sm:text-base">
                Move into the full operations dashboard for alert streams, deeper investigations, and system-level trend analysis.
              </p>
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="ripple-button rounded-xl border border-[#00ffa6aa] bg-gradient-to-r from-[#22ff88] via-[#00ff9f] to-[#00ffa6] px-6 text-[#000000] shadow-[0_0_24px_rgba(0,255,150,0.3)] transition-transform hover:scale-[1.03]"
                >
                  <LayoutDashboard className="mr-1 h-4 w-4" />
                  Explore Full Dashboard
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>
    </motion.div>
  )
}
