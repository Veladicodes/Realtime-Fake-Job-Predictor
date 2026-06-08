"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { AssetGrid, AssetFilters } from "@/components/dashboard/asset-grid"
import { ImageIcon, Upload, FolderOpen, Grid3X3, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDashboard } from "@/context/dashboard-context"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Asset {
  id: string
  name: string
  type: "image" | "video"
  thumbnail: string
  impressions: number
  engagement: number
  ctr: number
  campaign: string
  size: string
}

const sampleAssets: Asset[] = [
  { id: "a1", name: "Hero Banner Q1", type: "image", thumbnail: "/assets/campaign-hero-1.jpg", impressions: 42000, engagement: 12.4, ctr: 3.2, campaign: "Q1 Fraud Awareness", size: "large" },
  { id: "a2", name: "Safety Tips Video", type: "video", thumbnail: "/assets/campaign-hero-2.jpg", impressions: 28000, engagement: 18.7, ctr: 5.1, campaign: "Job Safety Campaign", size: "large" },
  { id: "a3", name: "Alert Banner", type: "image", thumbnail: "/assets/campaign-hero-3.jpg", impressions: 15000, engagement: 8.2, ctr: 2.1, campaign: "Enterprise Outreach", size: "small" },
]

function AssetVaultInner() {
  const [assets, setAssets] = useState<Asset[]>(sampleAssets)
  const { addNotification } = useDashboard()

  const addAsset = (asset: Omit<Asset, "id">) => {
    setAssets((prev) => [...prev, { ...asset, id: `asset-${Date.now()}` }])
  }
  const [activeFilter, setActiveFilter] = useState("All")
  const [showUpload, setShowUpload] = useState(false)
  const [newAsset, setNewAsset] = useState({
    name: "",
    type: "image" as "image" | "video",
    campaign: "",
  })

  // Filter assets based on active filter
  const filteredAssets = assets.filter((asset) => {
    if (activeFilter === "All") return true
    if (activeFilter === "Images") return asset.type === "image"
    if (activeFilter === "Videos") return asset.type === "video"
    if (activeFilter === "Top Performers") return asset.engagement > 10
    if (activeFilter === "Recent") return true
    return true
  })

  // Stats
  const totalAssets = assets.length
  const totalImages = assets.filter((a) => a.type === "image").length
  const totalVideos = assets.filter((a) => a.type === "video").length
  const avgEngagement = assets.length > 0 
    ? (assets.reduce((sum, a) => sum + a.engagement, 0) / assets.length).toFixed(1) 
    : "0.0"

  const handleUpload = () => {
    addAsset({
      name: newAsset.name,
      type: newAsset.type,
      thumbnail: `/assets/campaign-hero-${Math.floor(Math.random() * 8) + 1}.jpg`,
      impressions: 0,
      engagement: 0,
      ctr: 0,
      campaign: newAsset.campaign,
      size: "small",
    })
    setNewAsset({ name: "", type: "image", campaign: "" })
    setShowUpload(false)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Creative Management
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Asset Vault</h1>
          <p className="text-muted-foreground mt-1">
            Browse and analyze your creative assets
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent hidden sm:flex">
            <FolderOpen className="w-4 h-4" />
            Collections
          </Button>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Grid3X3 className="w-4 h-4" />
            <span className="hidden sm:inline">View</span>
          </Button>
          <Button 
            size="sm" 
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowUpload(true)}
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Upload New Asset</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="assetName">Asset Name</Label>
                <Input
                  id="assetName"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter asset name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="assetType">Type</Label>
                <select
                  id="assetType"
                  value={newAsset.type}
                  onChange={(e) => setNewAsset(prev => ({ ...prev, type: e.target.value as "image" | "video" }))}
                  className="w-full mt-1 h-10 px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div>
                <Label htmlFor="assetCampaign">Campaign</Label>
                <Input
                  id="assetCampaign"
                  value={newAsset.campaign}
                  onChange={(e) => setNewAsset(prev => ({ ...prev, campaign: e.target.value }))}
                  placeholder="Associated campaign"
                  className="mt-1"
                />
              </div>
              <div className="border-2 border-dashed border-border p-8 text-center">
                <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Drop files here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">(Demo: random placeholder will be used)</p>
              </div>
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 bg-transparent"
                  onClick={() => setShowUpload(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleUpload}
                  disabled={!newAsset.name}
                >
                  Upload Asset
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Assets</p>
          <p className="text-2xl font-mono font-semibold">{totalAssets}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Images</p>
          <p className="text-2xl font-mono font-semibold">{totalImages}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Videos</p>
          <p className="text-2xl font-mono font-semibold">{totalVideos}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg. Engagement</p>
          <p className="text-2xl font-mono font-semibold text-primary">{avgEngagement}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 md:mb-6 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        <AssetFilters activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      </div>

      {/* Asset Grid */}
      <AssetGrid assets={filteredAssets} />

      {/* Load More */}
      <div className="mt-6 md:mt-8 flex justify-center">
        <Button 
          variant="outline" 
          size="lg" 
          className="px-6 md:px-8 bg-transparent"
          onClick={() => addNotification({ title: "Load More", message: "More assets would be loaded from the server", type: "info" })}
        >
          Load More Assets
        </Button>
      </div>
    </div>
  )
}

export default function AssetVault() {
  return (
    <DashboardLayout>
      <AssetVaultInner />
    </DashboardLayout>
  )
}
