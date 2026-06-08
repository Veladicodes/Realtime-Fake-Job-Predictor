"use client"

import { cn } from "@/lib/utils"
import { ExternalLink, Play, Pause, MoreHorizontal } from "lucide-react"
import { useDashboard, type Campaign, type CampaignStatus } from "@/context/dashboard-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const statusConfig: Record<CampaignStatus, { label: string; className: string }> = {
  live: {
    label: "LIVE",
    className: "bg-primary/20 text-primary border-primary/40",
  },
  scheduled: {
    label: "SCHEDULED",
    className: "bg-primary/10 text-primary/90 border-primary/30",
  },
  paused: {
    label: "PAUSED",
    className: "bg-muted text-muted-foreground border-border",
  },
  ended: {
    label: "ENDED",
    className: "bg-muted text-muted-foreground border-border",
  },
}

interface CampaignFeedProps {
  campaigns?: Campaign[]
}

export function CampaignFeed({ campaigns: propCampaigns }: CampaignFeedProps) {
  const { campaigns: contextCampaigns } = useDashboard()
  const campaigns = propCampaigns || contextCampaigns
  
  return (
    <div className="bg-card border border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-medium">Live Campaign Feed</h2>
        <span className="text-xs text-muted-foreground font-mono">
          {campaigns.filter((c) => c.status === "live").length} active
        </span>
      </div>
      
      <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
        {campaigns.map((campaign) => (
          <CampaignRow key={campaign.id} campaign={campaign} />
        ))}
      </div>
    </div>
  )
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const config = statusConfig[campaign.status]
  const { toggleCampaignStatus, deleteCampaign, selectCampaign } = useDashboard()
  
  const canToggle = campaign.status === "live" || campaign.status === "paused"
  
  return (
    <div 
      className="p-3 md:p-4 flex items-center gap-4 hover:bg-surface-hover transition-colors group cursor-pointer"
      onClick={() => selectCampaign(campaign.id)}
    >
      {/* Status - Fixed width for alignment */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (canToggle) toggleCampaignStatus(campaign.id)
        }}
        disabled={!canToggle}
        className={cn(
          "w-20 text-center px-2 py-1 text-xs font-mono border shrink-0 transition-all",
          config.className,
          campaign.status === "live" && "pulse-live",
          canToggle && "hover:scale-105 cursor-pointer"
        )}
      >
        {config.label}
      </button>
      
      {/* Campaign Info - Flex grow */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">{campaign.name}</h3>
          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block shrink-0" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {campaign.channel} · {campaign.lastUpdated}
        </p>
      </div>
      
      {/* Metrics - Fixed width for alignment */}
      <div className="w-24 text-right shrink-0">
        <p className="text-sm font-mono">${campaign.spend.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">
          {(campaign.impressions / 1000).toFixed(1)}K impr
        </p>
      </div>
      
      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button 
            variant="ghost" 
            size="sm" 
            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canToggle && (
            <DropdownMenuItem onClick={() => toggleCampaignStatus(campaign.id)}>
              {campaign.status === "live" ? (
                <><Pause className="w-4 h-4 mr-2" /> Pause Campaign</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Resume Campaign</>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem 
            onClick={() => deleteCampaign(campaign.id)}
            className="text-red-500 focus:text-red-500"
          >
            Delete Campaign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// Real-time spend counter component
interface SpendCounterProps {
  totalSpend: number
  dailyBudget: number
}

export function SpendCounter({ totalSpend, dailyBudget }: SpendCounterProps) {
  const percentage = (totalSpend / dailyBudget) * 100

  return (
    <div className="bg-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium">Daily Spend</h2>
        <span className="text-xs text-muted-foreground font-mono">
          {percentage.toFixed(1)}% of budget
        </span>
      </div>
      
      <div className="mb-4">
        <span className="text-4xl font-mono font-semibold tracking-tighter">
          ${totalSpend.toLocaleString()}
        </span>
        <span className="text-muted-foreground ml-2">
          / ${dailyBudget.toLocaleString()}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="h-1 bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-1000 ease-out"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}
