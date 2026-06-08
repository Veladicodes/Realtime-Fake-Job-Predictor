"use client"

import { useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Eye, Heart, Share2, MoreHorizontal, Play, ImageIcon, Trash2 } from "lucide-react"
import { useDashboard, type Asset } from "@/context/dashboard-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AssetGridProps {
  assets: Asset[]
}

const sizeClasses = {
  small: "col-span-1 row-span-1",
  medium: "col-span-1 row-span-2",
  large: "col-span-2 row-span-2",
}

export function AssetGrid({ assets }: AssetGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-[160px] md:auto-rows-[180px]">
      {assets.map((asset, index) => (
        <AssetCard key={asset.id} asset={asset} index={index} />
      ))}
    </div>
  )
}

function AssetCard({ asset, index }: { asset: Asset; index: number }) {
  const [isHovered, setIsHovered] = useState(false)
  const { selectAsset, deleteAsset, addNotification } = useDashboard()

  const handleSelect = () => {
    selectAsset(asset.id)
    addNotification({
      title: "Asset Selected",
      message: `Viewing ${asset.name}`,
      type: "info",
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative group cursor-pointer overflow-hidden bg-card border border-border",
        sizeClasses[asset.size]
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleSelect}
    >
      {/* Thumbnail image */}
      <Image
        src={asset.thumbnail || "/placeholder.svg"}
        alt={asset.name}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
      />

      {/* Asset type indicator */}
      <div className="absolute top-3 left-3 z-10">
        {asset.type === "video" ? (
          <div className="w-8 h-8 bg-background/80 flex items-center justify-center">
            <Play className="w-4 h-4 fill-current" />
          </div>
        ) : (
          <div className="w-8 h-8 bg-background/80 flex items-center justify-center">
            <ImageIcon className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Engagement heatmap overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 z-20"
      >
        {/* Heatmap visualization */}
        <div className="absolute inset-0">
          <div
            className="absolute w-32 h-32 rounded-full"
            style={{
              background: `radial-gradient(circle, 
                rgba(0, 255, 178, ${0.1 + (asset.engagement / 100) * 0.3}) 0%, 
                transparent 70%)`,
              top: "20%",
              left: "30%",
            }}
          />
          <div
            className="absolute w-24 h-24 rounded-full"
            style={{
              background: `radial-gradient(circle, 
                rgba(0, 255, 178, ${0.1 + (asset.ctr / 10) * 0.2}) 0%, 
                transparent 70%)`,
              top: "40%",
              right: "20%",
            }}
          />
        </div>

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-background/60" />

        {/* Stats */}
        <div className="absolute inset-0 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">
              {asset.id.toUpperCase()}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleSelect()}>
                  <Eye className="w-4 h-4 mr-2" /> View Details
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => deleteAsset(asset.id)}
                  className="text-red-500 focus:text-red-500"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Asset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-1 truncate">{asset.name}</h3>
            <p className="text-xs text-muted-foreground mb-3">{asset.campaign}</p>
            
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono">{(asset.impressions / 1000).toFixed(0)}K</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono">{asset.engagement}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono">{asset.ctr}%</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Bottom label - visible when not hovered */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: isHovered ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 to-transparent"
      >
        <p className="text-sm font-medium truncate">{asset.name}</p>
        <p className="text-xs text-muted-foreground">{asset.campaign}</p>
      </motion.div>
    </motion.div>
  )
}

interface AssetFiltersProps {
  activeFilter: string
  onFilterChange: (filter: string) => void
}

export function AssetFilters({ activeFilter, onFilterChange }: AssetFiltersProps) {
  const filters = ["All", "Images", "Videos", "Top Performers", "Recent"]

  return (
    <div className="flex items-center gap-2 min-w-max">
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => onFilterChange(filter)}
          className={cn(
            "px-3 py-1.5 text-xs sm:text-sm transition-colors whitespace-nowrap",
            activeFilter === filter
              ? "bg-primary text-primary-foreground"
              : "bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover"
          )}
        >
          {filter}
        </button>
      ))}
    </div>
  )
}
