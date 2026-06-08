"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface PipelineVisualProps {
  activeStep: number
  burstMode?: boolean
  pipelineLabel?: string
}

const stages = [
  {
    key: "kafka",
    title: "Kafka Ingress",
    subtitle: "Event envelope received",
  },
  {
    key: "spark",
    title: "Spark Processing",
    subtitle: "Feature windows updated",
  },
  {
    key: "ml",
    title: "ML Scoring",
    subtitle: "Risk score + reason generated",
  },
  {
    key: "db",
    title: "DB Persistence",
    subtitle: "Alerts and trends committed",
  },
]

export function PipelineVisual({
  activeStep,
  burstMode = false,
  pipelineLabel = "kafka->spark->ml->db",
}: PipelineVisualProps) {
  return (
    <section className="rounded-2xl border border-border bg-[rgba(255,255,255,0.02)] p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">Pipeline Emulation</h2>
        <span className="rounded-full border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
          {pipelineLabel}
        </span>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {stages.map((stage, index) => {
          const isCurrent = index === activeStep
          const isComplete = index < activeStep
          const isPending = index > activeStep

          return (
            <div key={stage.key} className="contents">
              <motion.div
                className={cn(
                  "min-w-0 flex-1 rounded-xl border px-3 py-2",
                  isCurrent && burstMode
                    ? "border-red/50 bg-[rgba(255,255,255,0.02)]"
                    : isCurrent
                      ? "border-primary/55 bg-[rgba(255,255,255,0.02)]"
                      : isComplete
                        ? "border-primary/35 bg-[rgba(255,255,255,0.02)]"
                        : "border-border bg-[rgba(255,255,255,0.02)]"
                )}
                animate={
                  isCurrent
                    ? {
                        scale: [1, 1.015, 1],
                        y: [0, -1, 0],
                      }
                    : undefined
                }
                transition={{ duration: 0.8, repeat: isCurrent ? Number.POSITIVE_INFINITY : 0, repeatDelay: 0.6 }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.11em] text-foreground">{stage.title}</span>
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      isCurrent && burstMode
                        ? "bg-red pulse-live"
                        : isCurrent || isComplete
                          ? "bg-primary pulse-live"
                          : "bg-muted"
                    )}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{stage.subtitle}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px] font-mono uppercase tracking-[0.1em]",
                    isCurrent && burstMode
                      ? "text-red"
                      : isCurrent
                        ? "text-primary"
                        : isComplete
                          ? "text-primary/80"
                          : "text-muted-foreground"
                  )}
                >
                  {isCurrent ? "active" : isComplete ? "complete" : isPending ? "waiting" : "idle"}
                </p>
              </motion.div>

              {index < stages.length - 1 && (
                <div className="flex items-center justify-center px-1 py-0.5 md:px-2">
                  <motion.div
                    className={cn(
                      "h-1 w-8 rounded-full md:h-0.5 md:w-10",
                      index < activeStep
                        ? "bg-primary"
                        : isCurrent && burstMode
                          ? "bg-red"
                          : "bg-border"
                    )}
                    animate={
                      index <= activeStep
                        ? {
                            opacity: [0.45, 1, 0.45],
                          }
                        : undefined
                    }
                    transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
