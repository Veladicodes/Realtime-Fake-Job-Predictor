"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

interface GlanceCardProps {
  title: string
  value: number
  prefix?: string
  suffix?: string
  change?: number
  sparklineData?: number[]
  className?: string
  variant?: "default" | "danger" | "success" | "warning"
  icon?: LucideIcon
  subtitle?: string
}

function formatCompactNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(num >= 10000000 ? 1 : 2).replace(/\.?0+$/, '') + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(num >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + 'K'
  }
  return num.toLocaleString()
}

function useCountUp(end: number, duration: number = 2000) {
  const [count, setCount] = useState(0)
  const countRef = useRef(0)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const startValue = countRef.current
    const delta = end - startValue
    startTimeRef.current = null

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime
      }

      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      
      countRef.current = Math.floor(startValue + delta * easeOutQuart)
      setCount(countRef.current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [end, duration])

  return count
}

function getVariantColor(variant: GlanceCardProps["variant"]) {
  switch (variant) {
    case "danger":
      return "text-red"
    case "warning":
      return "text-red"
    default:
      return "text-primary"
  }
}

function getBorderStyle(variant: GlanceCardProps["variant"]) {
  switch (variant) {
    case "danger":
      return "border-red/55"
    case "warning":
      return "border-red/35"
    default:
      return "border-primary/30"
  }
}

function getChartColor(variant: GlanceCardProps["variant"]) {
  switch (variant) {
    case "danger":
      return "#ef4444"
    case "warning":
      return "#ef4444"
    default:
      return "#00ffb2"
  }
}

export const GlanceCard = memo(function GlanceCard({
  title,
  value,
  prefix = "",
  suffix = "",
  change,
  sparklineData,
  className,
  variant = "default",
  icon: Icon,
  subtitle,
}: GlanceCardProps) {
  const animatedValue = useCountUp(value)
  const chartData = useMemo(() => sparklineData?.map((point, index) => ({ value: point, index })) || [], [sparklineData])
  const isPositive = change !== undefined ? change >= 0 : true
  const gradientId = `glance-gradient-${title.toLowerCase().replace(/\s+/g, "-")}-${variant}`

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-[rgba(255,255,255,0.02)] p-4 md:p-5",
        getBorderStyle(variant),
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      
      <div className="relative z-10">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
            {subtitle && <p className="mt-1 text-xs text-muted-foreground/80">{subtitle}</p>}
          </div>

          {Icon && (
            <motion.div
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "rounded-xl border border-border bg-[rgba(255,255,255,0.02)] p-2",
                variant === "danger" || variant === "warning" ? "text-red" : "text-primary"
              )}
            >
              <Icon className="h-4 w-4" />
            </motion.div>
          )}
        </div>

        <div className="flex items-end justify-between gap-2">
          <span className={cn(
            "text-xl sm:text-2xl md:text-3xl font-mono font-semibold tracking-tight",
            getVariantColor(variant)
          )}>
            {prefix}{formatCompactNumber(animatedValue)}{suffix}
          </span>

          {change !== undefined && (
            <div
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                isPositive ? "border-primary/40 text-primary" : "border-red/45 text-red"
              )}
            >
              {isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              <span>{Math.abs(change).toFixed(1)}%</span>
            </div>
          )}
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-3 h-14 rounded-lg border border-border bg-[rgba(255,255,255,0.01)] px-1 py-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={getChartColor(variant)} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={getChartColor(variant)} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={getChartColor(variant)}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive
                  animationDuration={600}
                  style={{ filter: "drop-shadow(0 0 4px rgba(0,255,178,0.45))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </motion.div>
  )
})
