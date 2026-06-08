"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { PerformanceChart, AttributionRadar, MetricCard } from "@/components/dashboard/analytics-charts"
import { BarChart3, Download, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"

// Mock performance data
const performanceData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (29 - i))
  return {
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    roas: 3.2 + Math.random() * 1.5 + (i * 0.02),
    spend: 8000 + Math.random() * 4000 + (i * 100),
  }
})

// Attribution data
const attributionData = [
  { channel: "Meta Ads", value: 85, fullMark: 100 },
  { channel: "Google Ads", value: 72, fullMark: 100 },
  { channel: "TikTok", value: 58, fullMark: 100 },
  { channel: "YouTube", value: 45, fullMark: 100 },
  { channel: "Email", value: 68, fullMark: 100 },
  { channel: "Organic", value: 52, fullMark: 100 },
]

// Metrics
const metrics = [
  { title: "Average ROAS", value: "4.2x", change: 12.5, detail: "vs. 3.7x last period" },
  { title: "Total Revenue", value: "$1.24M", change: 18.3, detail: "From all channels" },
  { title: "Cost Per Acquisition", value: "$24.50", change: -8.2, detail: "15% below target" },
  { title: "Click-Through Rate", value: "3.8%", change: 5.4, detail: "Industry avg: 2.1%" },
  { title: "Conversion Rate", value: "4.2%", change: -2.1, detail: "Slight dip from Q4" },
  { title: "Customer LTV", value: "$342", change: 22.8, detail: "Up from $278" },
]

// Channel breakdown
const channelBreakdown = [
  { name: "Meta Ads", spend: 125000, revenue: 487500, roas: 3.9, conversions: 4250 },
  { name: "Google Ads", spend: 98000, revenue: 441000, roas: 4.5, conversions: 3680 },
  { name: "TikTok Ads", spend: 45000, revenue: 162000, roas: 3.6, conversions: 1850 },
  { name: "YouTube", spend: 62000, revenue: 192200, roas: 3.1, conversions: 1420 },
  { name: "Email", spend: 8500, revenue: 59500, roas: 7.0, conversions: 2100 },
]

export default function PerformanceEngine() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Deep Analytics
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Performance Engine</h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive analytics and attribution insights
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Last 30 Days</span>
              <span className="sm:hidden">30D</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6 md:mb-8">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              change={metric.change}
              detail={metric.detail}
            />
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
          <div className="lg:col-span-2">
            <PerformanceChart data={performanceData} />
          </div>
          <div>
            <AttributionRadar data={attributionData} />
          </div>
        </div>

        {/* Channel Breakdown Table */}
        <div className="bg-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-medium">Channel Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Channel</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Spend</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Revenue</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">ROAS</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Conversions</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channelBreakdown.map((channel) => {
                  const totalRevenue = channelBreakdown.reduce((sum, c) => sum + c.revenue, 0)
                  const share = (channel.revenue / totalRevenue) * 100

                  return (
                    <tr key={channel.name} className="hover:bg-surface-hover transition-colors">
                      <td className="p-4">
                        <span className="text-sm font-medium">{channel.name}</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-mono">${(channel.spend / 1000).toFixed(0)}K</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-mono">${(channel.revenue / 1000).toFixed(0)}K</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className={`text-sm font-mono ${channel.roas >= 4 ? "text-primary" : ""}`}>
                          {channel.roas.toFixed(1)}x
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-mono">{channel.conversions.toLocaleString()}</span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground w-10">
                            {share.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
