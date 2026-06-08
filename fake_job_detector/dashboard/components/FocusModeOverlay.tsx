"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ShieldAlert } from "lucide-react"

interface FocusModeOverlayProps {
  open: boolean
  jobTitle: string
  oldScore: number
  newScore: number
  onClose: () => void
}

export function FocusModeOverlay({ open, jobTitle, oldScore, newScore, onClose }: FocusModeOverlayProps) {
  const [displayScore, setDisplayScore] = useState(oldScore)
  const [progress, setProgress] = useState(0)
  const confidenceSurge = Math.max(0, Math.round(((newScore - oldScore) / Math.max(oldScore, 0.0001)) * 100))

  useEffect(() => {
    if (!open) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      onClose()
    }, 4200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      return
    }

    const durationMs = 1100
    const startedAt = performance.now()
    let rafId = 0

    const step = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAt) / durationMs)
      setProgress(nextProgress)
      setDisplayScore(oldScore + (newScore - oldScore) * nextProgress)

      if (nextProgress < 1) {
        rafId = window.requestAnimationFrame(step)
      }
    }

    rafId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(rafId)
  }, [open, oldScore, newScore])

  const red = Math.round(34 + progress * (239 - 34))
  const green = Math.round(255 + progress * (68 - 255))
  const blue = Math.round(136 + progress * (68 - 136))
  const scoreColor = `rgb(${red}, ${green}, ${blue})`

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[130] bg-[rgba(5,5,5,0.9)] backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={onClose}
        >
          <motion.div
            className="relative h-full w-full overflow-hidden"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{
              opacity: 1,
              scale: [1, 1.008, 1],
            }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(239,68,68,0.22),transparent_58%)]" />
              <div className="absolute -left-20 top-[-20%] h-[55vh] w-[55vh] rounded-full bg-red/10 blur-3xl" />
              <div className="absolute -right-24 bottom-[-18%] h-[58vh] w-[58vh] rounded-full bg-primary/12 blur-3xl" />
            </div>

            <div className="relative flex h-full w-full flex-col items-center justify-center px-6 py-8 text-center md:px-12">
              <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-red/45 bg-[rgba(255,255,255,0.04)] px-4 py-2 text-red">
                <ShieldAlert className="h-6 w-6 md:h-8 md:w-8" />
                <span className="text-xl font-black tracking-[0.14em] md:text-4xl">FRAUD DETECTED</span>
              </div>

              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground md:text-sm">Job</p>
              <p className="mt-3 max-w-5xl text-3xl font-semibold text-foreground md:text-6xl">{jobTitle}</p>

              <div className="mt-6 flex items-center justify-center gap-3 text-lg font-semibold md:text-3xl">
                <span className="text-primary">SAFE</span>
                <span className="text-primary">-&gt;</span>
                <span className="text-red">FRAUD</span>
              </div>

              <div className="mt-8 space-y-2">
                <p className="text-6xl font-black tracking-tight md:text-8xl" style={{ color: scoreColor }}>
                  {displayScore.toFixed(2)}
                </p>
                <p className="font-mono text-base text-muted-foreground md:text-2xl">
                  {oldScore.toFixed(2)} -&gt; {newScore.toFixed(2)}
                </p>
                <p className="text-lg font-semibold text-red md:text-3xl">Confidence Spike: +{confidenceSurge}%</p>
              </div>

              <p className="mt-10 text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground md:text-sm">
                Tap anywhere to dismiss
              </p>
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-red/45 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-primary/45 to-transparent" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
