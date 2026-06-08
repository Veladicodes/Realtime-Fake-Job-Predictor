"use client"

import { cn } from "@/lib/utils"
import { useDashboard } from "@/context/dashboard-context"

export function LiveIndicator() {
  const { systemStatus, connectionStatus, isLoading, isSystemDisconnected, isRunning, isStartingSimulation } = useDashboard()

  const degraded = systemStatus.degraded
  const isConnected = connectionStatus === "connected" && !isSystemDisconnected
  const isReconnecting = connectionStatus === "reconnecting"

  const label = !isRunning
    ? isStartingSimulation
      ? "Starting Stream"
      : "System Idle"
    : isLoading
    ? "Syncing"
    : isSystemDisconnected
      ? "Feed Paused"
      : isReconnecting
      ? "Reconnecting Stream"
      : degraded
        ? "System Degraded"
        : "System Live"

  const toneClass = !isRunning
    ? "text-amber-300"
    : isSystemDisconnected
    ? "text-red"
    : isReconnecting
      ? "text-amber-400"
      : "text-primary"

  const borderClass = !isRunning
    ? "border-amber-400/45"
    : isSystemDisconnected
    ? "border-red/50"
    : isReconnecting
      ? "border-amber-400/50"
      : "border-primary/40"

  const dotClass = !isRunning ? "bg-amber-300" : isSystemDisconnected ? "bg-red" : isReconnecting ? "bg-amber-400" : "bg-primary"

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1",
        borderClass,
        "bg-[rgba(255,255,255,0.02)]"
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            dotClass
          )}
        />
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", dotClass)} />
      </span>
      <span className={cn("text-[11px] font-mono uppercase tracking-[0.18em]", toneClass)}>
        {label}
      </span>
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
        {!isRunning ? "idle" : isConnected ? "connected" : isReconnecting ? "reconnecting" : "standby"}
      </span>
    </div>
  )
}
