"use client"

import { useMemo } from "react"

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  PolarRadiusAxis,
} from "recharts"

interface PerformanceChartProps {
  data: {
    date: string
    roas: number
    spend: number
  }[]
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  const sanitizedData = useMemo(
    () =>
      data.map((item) => ({
        date: item.date,
        roas: Number(item.roas) || 0,
        spend: Number(item.spend) || 0,
      })),
    [data]
  )

  return (
    <div className="bg-card border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-medium">ROAS vs Spend</h2>
          <p className="text-xs text-muted-foreground mt-1">Last 30 days performance</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 bg-primary h-3" />
            <span className="text-xs text-muted-foreground">ROAS</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 bg-foreground/30 h-3" />
            <span className="text-xs text-muted-foreground">Spend</span>
          </div>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sanitizedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="roasGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              dy={10}
            />
            <YAxis
              yAxisId="roas"
              orientation="left"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickFormatter={(value) => `${Number(value) || 0}x`}
              dx={-10}
            />
            <YAxis
              yAxisId="spend"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickFormatter={(value) => `$${((Number(value) || 0) / 1000).toFixed(0)}k`}
              dx={10}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--foreground)",
              }}
              labelStyle={{ color: "var(--foreground)" }}
              itemStyle={{ color: "var(--muted-foreground)" }}
            />
            <Area
              yAxisId="spend"
              type="monotone"
              dataKey="spend"
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              fill="url(#spendGradient)"
            />
            <Area
              yAxisId="roas"
              type="monotone"
              dataKey="roas"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#roasGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface AttributionData {
  channel: string
  value: number
  fullMark: number
}

interface AttributionRadarProps {
  data: AttributionData[]
}

export function AttributionRadar({ data }: AttributionRadarProps) {
  const sanitizedData = useMemo(
    () =>
      data.map((item) => ({
        channel: item.channel,
        value: Number(item.value) || 0,
        fullMark: Number(item.fullMark) || 0,
      })),
    [data]
  )

  return (
    <div className="bg-card border border-border p-6">
      <div className="mb-6">
        <h2 className="text-sm font-medium">Channel Attribution</h2>
        <p className="text-xs text-muted-foreground mt-1">Revenue contribution by channel</p>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={sanitizedData}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis
              dataKey="channel"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
            />
            <Radar
              name="Attribution"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="var(--primary)"
              fillOpacity={0.2}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--foreground)",
              }}
              formatter={(value: number) => [`${Number(value) || 0}%`, "Attribution"]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string
  change: number
  detail: string
}

export function MetricCard({ title, value, change, detail }: MetricCardProps) {
  const isPositive = change >= 0

  return (
    <div className="bg-card border border-border p-4">
      <p className="text-xs text-muted-foreground mb-2">{title}</p>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-mono font-semibold">{value}</span>
        <span
          className={`text-xs font-mono ${isPositive ? "text-primary" : "text-destructive"}`}
        >
          {isPositive ? "+" : ""}{change}%
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
