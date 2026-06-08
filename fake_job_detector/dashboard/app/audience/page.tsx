"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Users, UserPlus, Target, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts"

// Demographics data
const ageData = [
  { name: "18-24", value: 15, color: "#00ffb2" },
  { name: "25-34", value: 35, color: "#00e39f" },
  { name: "35-44", value: 28, color: "#00c18a" },
  { name: "45-54", value: 15, color: "#009f73" },
  { name: "55+", value: 7, color: "#007a59" },
]

const genderData = [
  { name: "Female", value: 58 },
  { name: "Male", value: 38 },
  { name: "Other", value: 4 },
]

const locationData = [
  { location: "United States", users: 45000 },
  { location: "United Kingdom", users: 12000 },
  { location: "Canada", users: 8500 },
  { location: "Germany", users: 6200 },
  { location: "Australia", users: 5800 },
  { location: "France", users: 4300 },
]

const audienceSegments = [
  { name: "High-Value Customers", size: 12500, ltv: "$450", engagement: "High" },
  { name: "Active Browsers", size: 45000, ltv: "$120", engagement: "Medium" },
  { name: "Cart Abandoners", size: 8200, ltv: "$85", engagement: "Low" },
  { name: "New Visitors", size: 67000, ltv: "$45", engagement: "Medium" },
  { name: "Loyal Repeat Buyers", size: 5600, ltv: "$680", engagement: "High" },
]

export default function AudienceIntel() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Audience Intelligence
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Audience Intel</h1>
            <p className="text-muted-foreground mt-1">
              Deep insights into your audience demographics and behavior
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">Segments</span>
            </Button>
            <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="bg-card border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Reach</p>
            <p className="text-2xl font-mono font-semibold">138.6K</p>
            <p className="text-xs text-primary mt-1">+12.4% this month</p>
          </div>
          <div className="bg-card border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Active Users</p>
            <p className="text-2xl font-mono font-semibold">52.3K</p>
            <p className="text-xs text-primary mt-1">+8.7% this month</p>
          </div>
          <div className="bg-card border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Avg. Session</p>
            <p className="text-2xl font-mono font-semibold">4:32</p>
            <p className="text-xs text-primary mt-1">+15s vs last month</p>
          </div>
          <div className="bg-card border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Retention Rate</p>
            <p className="text-2xl font-mono font-semibold">67.8%</p>
            <p className="text-xs text-destructive mt-1">-2.1% this month</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
          {/* Age Distribution */}
          <div className="bg-card border border-border p-6">
            <h2 className="text-sm font-medium mb-4">Age Distribution</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ageData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {ageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--foreground)",
                    }}
                    formatter={(value: number) => [`${value}%`, "Share"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {ageData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-2 h-2" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gender Split */}
          <div className="bg-card border border-border p-6">
            <h2 className="text-sm font-medium mb-4">Gender Distribution</h2>
            <div className="space-y-4 mt-8">
              {genderData.map((item) => (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{item.name}</span>
                    <span className="text-sm font-mono">{item.value}%</span>
                  </div>
                  <div className="h-2 bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Locations */}
          <div className="bg-card border border-border p-6">
            <h2 className="text-sm font-medium mb-4">Top Locations</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationData} layout="vertical">
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                  />
                  <YAxis
                    type="category"
                    dataKey="location"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    width={100}
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
                    formatter={(value: number) => [value.toLocaleString(), "Users"]}
                  />
                  <Bar dataKey="users" fill="var(--primary)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Audience Segments */}
        <div className="bg-card border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium">Audience Segments</h2>
            <Button variant="outline" size="sm">
              Manage Segments
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Segment</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Size</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Avg. LTV</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Engagement</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audienceSegments.map((segment) => (
                  <tr key={segment.name} className="hover:bg-surface-hover transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{segment.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-sm font-mono">{segment.size.toLocaleString()}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-sm font-mono">{segment.ltv}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`text-sm px-2 py-1 ${
                        segment.engagement === "High" 
                          ? "bg-primary/20 text-primary" 
                          : segment.engagement === "Medium"
                          ? "bg-primary/10 text-primary/80"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {segment.engagement}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button variant="outline" size="sm">
                        <TrendingUp className="w-3.5 h-3.5 mr-1" />
                        Target
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
