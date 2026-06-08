"use client"

import { FormEvent, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { analyzeJob } from "@/lib/api"

type PredictionValue = "FAKE" | "REAL"

interface PredictionResult {
  prediction: PredictionValue
  confidence: number
  explanation: string[]
  note?: string
  clusterId?: string
  oldScore?: number
  newScore?: number
  isCorrected?: boolean
}

export function JobInputPanel() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [requirements, setRequirements] = useState("")
  const [companyProfile, setCompanyProfile] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)

  const canAnalyze = useMemo(() => {
    return title.trim().length > 0 && description.trim().length > 0
  }, [title, description])

  const handleAnalyze = async () => {
    if (!canAnalyze) return

    setIsLoading(true)
    setError(null)

    try {
      const liveResult = await analyzeJob({
        title,
        description,
        requirements,
        company: companyProfile,
      })

      console.log("API RESULT:", liveResult)

      const predictionValue =
        typeof liveResult.prediction === "string"
          ? liveResult.prediction
          : liveResult.label === "FAKE"
            ? "FAKE"
            : liveResult.label === "REAL"
              ? "REAL"
              : Number(liveResult.prediction ?? 0) === 1
                ? "FAKE"
                : "REAL"

      const explanation =
        Array.isArray(liveResult.explanation) && liveResult.explanation.length > 0
          ? liveResult.explanation
          : [liveResult.reason ?? "Model explanation unavailable"]

      setResult({
        prediction: predictionValue,
        confidence: liveResult.confidence,
        explanation,
        note: liveResult.note,
        clusterId: liveResult.cluster_id,
        oldScore: liveResult.original_score,
        newScore: liveResult.updated_score,
        isCorrected: liveResult.is_corrected,
      })
    } catch (error) {
      console.error("ERROR:", error)
      setResult(null)
      const message = error instanceof Error ? error.message : "Analyze request failed"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const confidencePercent = result ? Math.round(result.confidence * 100) : 0
  const predictionIsFake = result?.prediction === "FAKE"

  return (
    <div className="neon-card rounded-2xl p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[#e4fce8]">Analyze Job Posting</h2>
        <p className="mt-1 text-xs text-[#9ca3af]">Submit posting details for instant fraud risk scoring.</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
        }}
      >
        <div>
          <label className="text-xs font-medium text-[#99c8aa]" htmlFor="job-title">
            Job Title
          </label>
          <Input
            id="job-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Senior Data Analyst (Remote)"
            className="mt-1 rounded-xl border-[#2f8f58]/60 bg-[#050505b3] text-[#ffffff] placeholder:text-[#77a989] focus-visible:border-[#00ffa6] focus-visible:ring-[#00ff9f66]"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[#99c8aa]" htmlFor="job-description">
            Job Description
          </label>
          <Textarea
            id="job-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Paste the full job description..."
            className="mt-1 min-h-24 rounded-xl border-[#2f8f58]/60 bg-[#050505b3] text-[#ffffff] placeholder:text-[#77a989] focus-visible:border-[#00ffa6] focus-visible:ring-[#00ff9f66]"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[#99c8aa]" htmlFor="job-requirements">
            Requirements
          </label>
          <Textarea
            id="job-requirements"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="Required skills and qualifications..."
            className="mt-1 min-h-20 rounded-xl border-[#2f8f58]/60 bg-[#050505b3] text-[#ffffff] placeholder:text-[#77a989] focus-visible:border-[#00ffa6] focus-visible:ring-[#00ff9f66]"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[#99c8aa]" htmlFor="company-info">
            Company Info
          </label>
          <Textarea
            id="company-info"
            value={companyProfile}
            onChange={(e) => setCompanyProfile(e.target.value)}
            placeholder="Company website, profile, and hiring details..."
            className="mt-1 min-h-20 rounded-xl border-[#2f8f58]/60 bg-[#050505b3] text-[#ffffff] placeholder:text-[#77a989] focus-visible:border-[#00ffa6] focus-visible:ring-[#00ff9f66]"
          />
        </div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
          <Button
            type="button"
            onClick={() => {
              void handleAnalyze()
            }}
            disabled={!canAnalyze || isLoading}
            className="ripple-button w-full rounded-xl border border-[#00ffa6aa] bg-gradient-to-r from-[#22ff88] via-[#00ff9f] to-[#00ffa6] text-[#021209] shadow-[0_0_30px_rgba(0,255,150,0.34)] transition-all hover:shadow-[0_0_44px_rgba(0,255,150,0.5)] sm:w-auto"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="size-4" />
                Analyzing...
              </span>
            ) : (
              "Analyze Job"
            )}
          </Button>
        </motion.div>
      </form>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-3 text-xs text-[#ff9da5]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={`${result.prediction}-${confidencePercent}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "mt-5 rounded-xl border p-4",
              predictionIsFake
                ? "border-[#ef444477] bg-[#2d1018cc] shadow-[0_0_28px_rgba(239,68,68,0.26)]"
                : "border-[#00ffa677] bg-[#062214cc] shadow-[0_0_28px_rgba(0,255,150,0.26)]"
            )}
          >
            <div className="flex flex-wrap items-center gap-4 justify-between">
              <div>
                <p className="text-xs text-[#9ca3af]">Prediction</p>
                <p
                  className={cn(
                    "inline-flex rounded-full border px-3 py-1 text-sm font-semibold",
                    predictionIsFake
                      ? "border-[#ef4444aa] bg-[#ef444422] text-[#ff9da5]"
                      : "border-[#00ffa6aa] bg-[#00ff9f22] text-[#c6f9d8]"
                  )}
                >
                  {result.prediction}
                </p>
              </div>
              <div className="min-w-40 flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#9ca3af]">Confidence</span>
                  <span className="font-mono text-[#ffffff]">{confidencePercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#0a1d15]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${confidencePercent}%` }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className={cn(
                      "h-full",
                      predictionIsFake
                        ? "bg-gradient-to-r from-[#b91c1c] to-[#ef4444]"
                        : "bg-gradient-to-r from-[#22ff88] to-[#00ffa6]"
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs text-[#9ca3af]">Explanation</p>
              <ul className="space-y-1">
                {result.explanation.map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm text-[#ffffff]">
                    - {item}
                  </li>
                ))}
              </ul>

              {(result.note || result.clusterId) && (
                <div className="mt-3 space-y-1 text-xs text-[#99c8aa]">
                  {result.note && <p>{result.note}</p>}
                  {result.clusterId && <p>Cluster: {result.clusterId}</p>}
                  {typeof result.oldScore === "number" && typeof result.newScore === "number" && result.isCorrected && (
                    <p>
                      Score updated {Math.round(result.oldScore * 100)}% -&gt; {Math.round(result.newScore * 100)}%
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
