"use client"

import { useMemo } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { useDashboard } from "@/context/dashboard-context"
import { LiveIndicator } from "@/components/dashboard/live-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts"

function TrendsPageInner() {
  const { trends, isLoading, error } = useDashboard()

  const chartTrends = useMemo(
    () =>
      trends.map((item) => ({
        timestamp: item.timestamp,
        totalJobs: Math.max(0, Number(item.totalJobs) || 0),
        fakeJobs: Math.max(0, Number(item.fakeJobs) || 0),
      })),
    [trends]
  )

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <LiveIndicator />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Trends Analysis
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2">
          Historical fraud detection trends and patterns
        </p>
      </div>

      <div className="bg-card border border-border p-6">
        <h2 className="text-sm font-semibold mb-4">Jobs Over Time</h2>
        <div className="h-96">
          {isLoading && chartTrends.length === 0 ? (
            <Skeleton className="h-full w-full rounded-xl bg-muted/25" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="timestamp" tick={{ fill: "var(--muted-foreground)" }} axisLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)" }} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="totalJobs" stroke="var(--primary)" strokeWidth={2} name="Total Jobs" />
                <Line type="monotone" dataKey="fakeJobs" stroke="var(--destructive)" strokeWidth={2} name="Fake Jobs" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}

export default function TrendsPage() {
  return (
    <DashboardLayout>
      <TrendsPageInner />
    </DashboardLayout>
  )
}
