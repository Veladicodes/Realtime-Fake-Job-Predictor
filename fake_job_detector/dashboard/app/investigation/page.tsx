"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { useDashboard } from "@/context/dashboard-context"
import { LiveIndicator } from "@/components/dashboard/live-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

function InvestigationPageInner() {
  const { investigationData, isLoading, error } = useDashboard()

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <LiveIndicator />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Investigation & Analysis
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2">
          Deep-dive fraud pattern analysis and investigation tools
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Keywords */}
        <div className="bg-card border border-border p-6">
          <h2 className="text-sm font-semibold mb-4">Top Suspicious Keywords</h2>
          <div className="h-80">
            {isLoading && investigationData.topKeywords.length === 0 ? (
              <Skeleton className="h-full w-full rounded-xl bg-muted/25" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={investigationData.topKeywords} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="keyword"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                  />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                    }}
                  />
                  <Bar dataKey="count" fill="var(--red)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Fraud Reasons */}
        <div className="bg-card border border-border p-6">
          <h2 className="text-sm font-semibold mb-4">Fraud Reason Distribution</h2>
          <div className="h-80">
            {isLoading && investigationData.reasonDistribution.length === 0 ? (
              <Skeleton className="h-full w-full rounded-xl bg-muted/25" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={investigationData.reasonDistribution}
                    dataKey="count"
                    nameKey="reason"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={{
                      fontSize: 11,
                      fill: "var(--muted-foreground)",
                    }}
                  >
                    {investigationData.reasonDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          index % 3 === 0
                            ? "var(--destructive)"
                            : index % 3 === 1
                              ? "var(--primary)"
                              : "rgba(0, 255, 178, 0.58)"
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-xs text-destructive">{error}</p>}
    </div>
  )
}

export default function InvestigationPage() {
  return (
    <DashboardLayout>
      <InvestigationPageInner />
    </DashboardLayout>
  )
}
