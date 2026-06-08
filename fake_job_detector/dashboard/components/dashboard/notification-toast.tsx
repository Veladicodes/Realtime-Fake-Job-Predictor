"use client"

import { useDashboard } from "@/context/dashboard-context"
import { motion, AnimatePresence } from "framer-motion"
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

const iconMap = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
}

const colorMap = {
  success: "text-primary border-primary/35",
  warning: "text-red border-red/35",
  error: "text-red border-red/45",
  info: "text-primary border-primary/35",
}

export function NotificationToast() {
  const { notifications, dismissNotification } = useDashboard()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => {
          const Icon = iconMap[notification.type]
          return (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex items-start gap-3 border bg-[rgba(255,255,255,0.02)] p-4",
                colorMap[notification.type]
              )}
            >
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{notification.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
              </div>
              <button
                onClick={() => dismissNotification(notification.id)}
                className="p-1 hover:bg-surface-hover transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
