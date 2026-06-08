"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { X, Play, Pause, CheckCircle, XCircle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type CampaignStatus = "live" | "scheduled" | "paused" | "ended"

interface TimelineCampaign {
  id: string
  name: string
  status: CampaignStatus
  startDate: Date
  endDate: Date
  progress: number
  channel: string
  budget: number
}

interface GanttTimelineProps {
  campaigns: TimelineCampaign[]
  startDate: Date
  endDate: Date
  onCampaignUpdate?: (id: string, updates: Partial<TimelineCampaign>) => void
  onCampaignDelete?: (id: string) => void
}

const statusColors: Record<CampaignStatus, string> = {
  live: "bg-primary/20 border-primary/60",
  scheduled: "bg-primary/10 border-primary/40",
  paused: "bg-muted border-border",
  ended: "bg-muted/70 border-border/80",
}

const statusGlows: Record<CampaignStatus, string> = {
  live: "shadow-[0_0_14px_rgba(0,255,178,0.24)]",
  scheduled: "shadow-[0_0_10px_rgba(0,255,178,0.16)]",
  paused: "",
  ended: "",
}

const formatDateForInput = (date: Date) => {
  // Format as YYYY-MM-DD in local timezone
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Parse date string as local date to avoid timezone issues
const parseLocalDate = (dateInput: Date | string): Date => {
  if (dateInput instanceof Date) return dateInput
  // For YYYY-MM-DD strings, parse as local date (not UTC)
  const str = String(dateInput)
  if (str.includes("T")) {
    // ISO string - create date and work with it
    return new Date(str)
  }
  // YYYY-MM-DD format - parse as local date
  const [year, month, day] = str.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function GanttTimeline({ campaigns, startDate, endDate, onCampaignUpdate, onCampaignDelete }: GanttTimelineProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<TimelineCampaign | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    channel: "",
    budget: 0,
    progress: 0,
    startDate: "",
    endDate: "",
  })

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  
  // Filter campaigns that overlap with the visible timeline range
  const visibleCampaigns = campaigns.filter(campaign => {
    return campaign.endDate >= startDate && campaign.startDate <= endDate
  })
  
  // Generate week labels
  const weeks: Date[] = []
  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    weeks.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 7)
  }

  const getPosition = (date: Date | string) => {
    const dateObj = parseLocalDate(date)
    const clampedDate = new Date(Math.max(startDate.getTime(), Math.min(endDate.getTime(), dateObj.getTime())))
    const days = Math.ceil((clampedDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, Math.min(100, (days / totalDays) * 100))
  }

  const getWidth = (start: Date | string, end: Date | string) => {
    const startObj = parseLocalDate(start)
    const endObj = parseLocalDate(end)
    const clampedStart = new Date(Math.max(startDate.getTime(), startObj.getTime()))
    const clampedEnd = new Date(Math.min(endDate.getTime(), endObj.getTime()))
    const startPos = getPosition(clampedStart)
    const endPos = getPosition(clampedEnd)
    return Math.max(0, endPos - startPos)
  }

  const handleCampaignClick = (campaign: TimelineCampaign) => {
    // Ensure dates are Date objects using local date parsing
    const normalizedCampaign = {
      ...campaign,
      startDate: parseLocalDate(campaign.startDate),
      endDate: parseLocalDate(campaign.endDate),
    }
    setSelectedCampaign(normalizedCampaign)
    setEditForm({
      name: normalizedCampaign.name,
      channel: normalizedCampaign.channel,
      budget: normalizedCampaign.budget,
      progress: normalizedCampaign.progress,
      startDate: formatDateForInput(normalizedCampaign.startDate),
      endDate: formatDateForInput(normalizedCampaign.endDate),
    })
    setIsEditing(false)
  }

  const handleSave = () => {
    if (selectedCampaign && onCampaignUpdate) {
      onCampaignUpdate(selectedCampaign.id, {
        name: editForm.name,
        channel: editForm.channel,
        budget: editForm.budget,
        progress: editForm.progress,
        startDate: parseLocalDate(editForm.startDate),
        endDate: parseLocalDate(editForm.endDate),
      })
    }
    setIsEditing(false)
  }

  const handleStatusChange = (newStatus: CampaignStatus) => {
    if (selectedCampaign && onCampaignUpdate) {
      onCampaignUpdate(selectedCampaign.id, { 
        status: newStatus,
        progress: newStatus === "ended" ? 100 : selectedCampaign.progress,
      })
      setSelectedCampaign({ ...selectedCampaign, status: newStatus })
    }
  }

  const handleDelete = () => {
    if (selectedCampaign && onCampaignDelete) {
      onCampaignDelete(selectedCampaign.id)
      setSelectedCampaign(null)
    }
  }

  return (
    <>
      <div className="bg-card border border-border overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-medium">Campaign Timeline</h2>
          <div className="flex items-center gap-4 flex-wrap">
            {(["live", "scheduled", "paused", "ended"] as CampaignStatus[]).map((status) => (
              <div key={status} className="flex items-center gap-2">
                <div className={cn("w-3 h-3 border", statusColors[status])} />
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Timeline Container */}
        <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
          {/* Timeline Header */}
          <div className="border-b border-border sticky top-0 bg-card z-10">
            <div className="flex min-w-[800px]">
              <div className="w-48 md:w-64 shrink-0 border-r border-border p-3 bg-card">
                <span className="text-xs font-medium text-muted-foreground">Campaign</span>
              </div>
              <div className="flex-1 relative">
                <div className="flex">
                  {weeks.map((week, index) => (
                    <div
                      key={index}
                      className="flex-1 p-3 border-r border-border last:border-r-0 text-center"
                    >
                      <span className="text-xs font-mono text-muted-foreground">
                        {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Rows */}
          <div className="divide-y divide-border">
            {visibleCampaigns.map((campaign, index) => (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex group hover:bg-surface-hover transition-colors min-w-[800px] cursor-pointer"
                onClick={() => handleCampaignClick(campaign)}
              >
                {/* Campaign Info */}
                <div className="w-48 md:w-64 shrink-0 border-r border-border p-3 md:p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 shrink-0", statusColors[campaign.status].split(" ")[0])} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">{campaign.channel}</p>
                    </div>
                  </div>
                </div>

                {/* Timeline Bar */}
                <div className="flex-1 relative py-4 px-2">
                  <div className="absolute inset-0 flex">
                    {weeks.map((_, i) => (
                      <div key={i} className="flex-1 border-r border-border/50 last:border-r-0" />
                    ))}
                  </div>

                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: index * 0.05 + 0.2, duration: 0.4 }}
                    style={{
                      left: `${getPosition(campaign.startDate)}%`,
                      width: `${getWidth(campaign.startDate, campaign.endDate)}%`,
                      originX: 0,
                    }}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 h-8 border",
                      statusColors[campaign.status],
                      campaign.status === "live" && statusGlows[campaign.status]
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 opacity-50",
                        campaign.status === "live" || campaign.status === "scheduled"
                          ? "bg-primary"
                          : "bg-white/10"
                      )}
                      style={{ width: `${campaign.progress}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-2">
                      <span className="text-xs font-mono truncate">{campaign.progress}%</span>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            ))}

            {visibleCampaigns.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-sm">No campaigns in this date range</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campaign Detail Modal */}
      <AnimatePresence>
        {selectedCampaign && (
          <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">
                  {isEditing ? "Edit Campaign" : "Campaign Details"}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="editName">Campaign Name</Label>
                    <Input
                      id="editName"
                      value={editForm.name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="editChannel">Channel</Label>
                    <select
                      id="editChannel"
                      value={editForm.channel}
                      onChange={(e) => setEditForm(prev => ({ ...prev, channel: e.target.value }))}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="editStartDate">Start Date</Label>
                      <Input
                        id="editStartDate"
                        type="date"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm(prev => ({ ...prev, startDate: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="editEndDate">End Date</Label>
                      <Input
                        id="editEndDate"
                        type="date"
                        value={editForm.endDate}
                        onChange={(e) => setEditForm(prev => ({ ...prev, endDate: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="editBudget">Budget ($)</Label>
                      <Input
                        id="editBudget"
                        type="number"
                        value={editForm.budget}
                        onChange={(e) => setEditForm(prev => ({ ...prev, budget: Number(e.target.value) }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="editProgress">Progress (%)</Label>
                      <Input
                        id="editProgress"
                        type="number"
                        min="0"
                        max="100"
                        value={editForm.progress}
                        onChange={(e) => setEditForm(prev => ({ ...prev, progress: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave}>
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Campaign Info */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-3 h-3", statusColors[selectedCampaign.status].split(" ")[0])} />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{selectedCampaign.status}</span>
                    </div>
                    <h3 className="text-xl font-semibold">{selectedCampaign.name}</h3>
                    <p className="text-muted-foreground">{selectedCampaign.channel}</p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-surface p-3 border border-border">
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="text-lg font-mono font-semibold">${selectedCampaign.budget.toLocaleString()}</p>
                    </div>
                    <div className="bg-surface p-3 border border-border">
                      <p className="text-xs text-muted-foreground">Progress</p>
                      <p className="text-lg font-mono font-semibold">{selectedCampaign.progress}%</p>
                    </div>
                    <div className="bg-surface p-3 border border-border">
                      <p className="text-xs text-muted-foreground">Start Date</p>
                      <p className="text-sm font-mono">{selectedCampaign.startDate.toLocaleDateString()}</p>
                    </div>
                    <div className="bg-surface p-3 border border-border">
                      <p className="text-xs text-muted-foreground">End Date</p>
                      <p className="text-sm font-mono">{selectedCampaign.endDate.toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{selectedCampaign.progress}%</span>
                    </div>
                    <div className="h-2 bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${selectedCampaign.progress}%` }} />
                    </div>
                  </div>

                  {/* Status Actions */}
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Change Status</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCampaign.status !== "live" && selectedCampaign.status !== "ended" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-transparent"
                          onClick={() => handleStatusChange("live")}
                        >
                          <Play className="w-4 h-4" /> Start Campaign
                        </Button>
                      )}
                      {selectedCampaign.status === "live" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-transparent"
                          onClick={() => handleStatusChange("paused")}
                        >
                          <Pause className="w-4 h-4" /> Pause
                        </Button>
                      )}
                      {selectedCampaign.status === "paused" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-transparent"
                          onClick={() => handleStatusChange("live")}
                        >
                          <Play className="w-4 h-4" /> Resume
                        </Button>
                      )}
                      {selectedCampaign.status !== "ended" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-transparent text-primary border-primary hover:bg-primary/10"
                          onClick={() => handleStatusChange("ended")}
                        >
                          <CheckCircle className="w-4 h-4" /> Mark Completed
                        </Button>
                      )}
                      {selectedCampaign.status !== "ended" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-transparent text-destructive border-destructive hover:bg-destructive/10"
                          onClick={() => handleStatusChange("ended")}
                        >
                          <XCircle className="w-4 h-4" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="flex-1 bg-transparent"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit Campaign
                    </Button>
                    <Button
                      variant="outline"
                      className="bg-transparent text-destructive border-destructive hover:bg-destructive/10"
                      onClick={handleDelete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
