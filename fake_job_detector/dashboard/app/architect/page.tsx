"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { GanttTimeline } from "@/components/dashboard/gantt-timeline"
import { Calendar, Plus, Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Campaign {
  id: string
  name: string
  status: "live" | "paused" | "scheduled" | "ended"
  spend: number
  impressions: number
  channel: string
  lastUpdated: string
  startDate: Date
  endDate: Date
  progress: number
  budget: number
}

const sampleCampaigns: Campaign[] = [
  {
    id: "camp-001",
    name: "Q1 Fraud Awareness",
    status: "live",
    spend: 4200,
    impressions: 85000,
    channel: "Meta Ads",
    lastUpdated: "2 hours ago",
    startDate: new Date(2026, 0, 1),
    endDate: new Date(2026, 2, 31),
    progress: 45,
    budget: 15000,
  },
  {
    id: "camp-002",
    name: "Job Safety Campaign",
    status: "scheduled",
    spend: 0,
    impressions: 0,
    channel: "Google Ads",
    lastUpdated: "1 day ago",
    startDate: new Date(2026, 3, 1),
    endDate: new Date(2026, 5, 30),
    progress: 0,
    budget: 20000,
  },
  {
    id: "camp-003",
    name: "Enterprise Outreach",
    status: "paused",
    spend: 8100,
    impressions: 120000,
    channel: "Email",
    lastUpdated: "3 days ago",
    startDate: new Date(2025, 11, 1),
    endDate: new Date(2026, 1, 28),
    progress: 72,
    budget: 12000,
  },
]

// Parse date string as local date to avoid timezone issues
const parseLocalDate = (dateInput: Date | string): Date => {
  if (dateInput instanceof Date) return dateInput
  const str = String(dateInput)
  if (str.includes("T")) {
    return new Date(str)
  }
  const [year, month, day] = str.split("-").map(Number)
  return new Date(year, month - 1, day)
}

// Format date as YYYY-MM-DD in local timezone
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const addDays = (date: Date, days: number): Date => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function CampaignArchitectContent() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(sampleCampaigns)
  const [showNewCampaign, setShowNewCampaign] = useState(false)

  const addCampaign = (campaign: Omit<Campaign, "id">) => {
    setCampaigns((prev) => [...prev, { ...campaign, id: `camp-${Date.now()}` }])
  }
  const updateCampaign = (id: string, updates: Record<string, unknown>) => {
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
  }
  const deleteCampaign = (id: string) => {
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
  }
  const toggleCampaignStatus = (id: string) => {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: c.status === "live" ? "paused" : "live" } : c))
    )
  }
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    channel: "Meta Ads",
    budget: 10000,
    startDate: formatLocalDate(new Date()),
    endDate: formatLocalDate(addDays(new Date(), 30)),
  })
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter === "all") return true
    return c.status === statusFilter
  })

  const totalCampaigns = campaigns.length
  const activeCampaigns = campaigns.filter(c => c.status === "live").length
  const scheduledCampaigns = campaigns.filter(c => c.status === "scheduled").length
  const totalCampaignBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0)

  const handleCreateCampaign = () => {
    addCampaign({
      name: newCampaign.name,
      status: "scheduled",
      spend: 0,
      impressions: 0,
      channel: newCampaign.channel,
      lastUpdated: "Just now",
      startDate: parseLocalDate(newCampaign.startDate),
      endDate: parseLocalDate(newCampaign.endDate),
      progress: 0,
      budget: newCampaign.budget,
    })
    setNewCampaign({ 
      name: "", 
      channel: "Meta Ads", 
      budget: 10000,
      startDate: formatLocalDate(new Date()),
      endDate: formatLocalDate(addDays(new Date(), 30)),
    })
    setShowNewCampaign(false)
  }

  const handleCampaignUpdate = (id: string, updates: Record<string, unknown>) => {
    updateCampaign(id, updates)
  }

  const handleCampaignDelete = (id: string) => {
    deleteCampaign(id)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Campaign Management
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Campaign Architect</h1>
          <p className="text-muted-foreground mt-1">
            Visualize and manage your campaign timeline
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-sm bg-transparent border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Status</option>
            <option value="live">Live</option>
            <option value="paused">Paused</option>
            <option value="scheduled">Scheduled</option>
            <option value="ended">Ended</option>
          </select>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button 
            size="sm" 
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowNewCampaign(true)}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Campaign</span>
          </Button>
        </div>
      </div>

      {showNewCampaign && (
        <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Create New Campaign</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowNewCampaign(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter campaign name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="channel">Channel</Label>
                <select
                  id="channel"
                  value={newCampaign.channel}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, channel: e.target.value }))}
                  className="w-full mt-1 h-10 px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Meta Ads">Meta Ads</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="TikTok Ads">TikTok Ads</option>
                  <option value="YouTube">YouTube</option>
                  <option value="Email">Email</option>
                  <option value="Multi-channel">Multi-channel</option>
                </select>
              </div>
              <div>
                <Label htmlFor="budget">Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  value={newCampaign.budget}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, budget: Number(e.target.value) }))}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={newCampaign.startDate}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, startDate: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={newCampaign.endDate}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, endDate: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 bg-transparent"
                  onClick={() => setShowNewCampaign(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleCreateCampaign}
                  disabled={!newCampaign.name}
                >
                  Create Campaign
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Campaigns</p>
          <p className="text-2xl font-mono font-semibold">{totalCampaigns}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Active Now</p>
          <p className="text-2xl font-mono font-semibold text-primary">{activeCampaigns}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Scheduled</p>
          <p className="text-2xl font-mono font-semibold text-primary/85">{scheduledCampaigns}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Budget</p>
          <p className="text-2xl font-mono font-semibold">${(totalCampaignBudget / 1000).toFixed(0)}K</p>
        </div>
      </div>

      <GanttTimeline
        campaigns={filteredCampaigns.map(c => ({
          ...c,
          startDate: c.startDate ? parseLocalDate(c.startDate) : new Date(),
          endDate: c.endDate ? parseLocalDate(c.endDate) : addDays(new Date(), 30),
          progress: c.progress || 0,
          budget: c.budget || 0,
        }))}
        startDate={new Date(2026, 0, 1)}
        endDate={new Date(2026, 3, 30)}
        onCampaignUpdate={handleCampaignUpdate}
        onCampaignDelete={handleCampaignDelete}
      />

      <div className="mt-6 md:mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Campaign Details</h2>
          <span className="text-xs text-muted-foreground">Click a campaign to view details</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {filteredCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-card border border-border p-4 hover:bg-surface-hover transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground">{campaign.id.toUpperCase()}</span>
                <div className={`w-2 h-2 ${campaign.status === "live" ? "bg-primary pulse-live" : campaign.status === "scheduled" ? "bg-primary/70" : campaign.status === "paused" ? "bg-muted-foreground" : "bg-muted-foreground/70"}`} />
              </div>
              <h3 className="text-sm font-medium mb-1 group-hover:text-primary transition-colors">
                {campaign.name}
              </h3>
              <p className="text-xs text-muted-foreground mb-2">{campaign.channel}</p>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground">
                  {campaign.startDate ? parseLocalDate(campaign.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A"} - {campaign.endDate ? parseLocalDate(campaign.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Budget</span>
                <span className="font-mono">${((campaign.budget || 0) / 1000).toFixed(0)}K</span>
              </div>
              <div className="mt-3 h-1 bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${campaign.progress || 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground capitalize">{campaign.status}</span>
                {(campaign.status === "live" || campaign.status === "paused") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCampaignStatus(campaign.id)
                    }}
                  >
                    {campaign.status === "live" ? "Pause" : "Resume"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CampaignArchitect() {
  return (
    <DashboardLayout>
      <CampaignArchitectContent />
    </DashboardLayout>
  )
}
