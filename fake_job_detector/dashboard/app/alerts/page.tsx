"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { FraudAlertsPanel } from "@/components/dashboard/fraud-alerts-panel"
import { useDashboard } from "@/context/dashboard-context"
import { LiveIndicator } from "@/components/dashboard/live-indicator"

function AlertsPageInner() {
  const { alerts, isLoading, error } = useDashboard()

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <LiveIndicator />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Fraud Alerts
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2">
          {isLoading ? "Syncing live alerts..." : `${alerts.length} active fraud alerts with filtering and sorting`}
        </p>
        {error && <p className="mt-2 text-xs text-red">{error}</p>}
      </div>

      <FraudAlertsPanel />
    </div>
  )
}

export default function AlertsPage() {
  return (
    <DashboardLayout>
      <AlertsPageInner />
    </DashboardLayout>
  )
}
