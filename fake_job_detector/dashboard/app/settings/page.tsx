"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Settings, User, Bell, Shield, Palette, Globe, Key } from "lucide-react"
import { Button } from "@/components/ui/button"

const settingsSections = [
  {
    title: "Profile",
    icon: User,
    description: "Manage your personal information and preferences",
    items: [
      { label: "Full Name", value: "John Doe" },
      { label: "Email", value: "john.doe@company.com" },
      { label: "Role", value: "Marketing Lead" },
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    description: "Configure how you receive alerts and updates",
    items: [
      { label: "Email Notifications", value: "Enabled", toggle: true },
      { label: "Push Notifications", value: "Enabled", toggle: true },
      { label: "Weekly Digest", value: "Disabled", toggle: true },
    ],
  },
  {
    title: "Security",
    icon: Shield,
    description: "Manage your account security settings",
    items: [
      { label: "Two-Factor Auth", value: "Enabled" },
      { label: "Last Login", value: "Today, 9:42 AM" },
      { label: "Active Sessions", value: "2 devices" },
    ],
  },
  {
    title: "Integrations",
    icon: Key,
    description: "Connect external services and APIs",
    items: [
      { label: "Meta Ads", value: "Connected" },
      { label: "Google Ads", value: "Connected" },
      { label: "TikTok Ads", value: "Not Connected" },
    ],
  },
]

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Configuration
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account and application preferences
          </p>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingsSections.map((section) => (
            <div key={section.title} className="bg-card border border-border">
              <div className="p-4 border-b border-border flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                  <section.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-medium">{section.title}</h2>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
              </div>
              <div className="divide-y divide-border">
                {section.items.map((item) => (
                  <div key={item.label} className="p-4 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono">{item.value}</span>
                      {item.toggle && (
                        <button className="w-10 h-5 bg-primary/20 relative">
                          <div className={`absolute top-0.5 ${item.value === "Enabled" ? "right-0.5 bg-primary" : "left-0.5 bg-muted-foreground"} w-4 h-4 transition-all`} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between p-4 bg-card border border-border">
          <div>
            <p className="text-sm font-medium">Danger Zone</p>
            <p className="text-xs text-muted-foreground">Irreversible account actions</p>
          </div>
          <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 bg-transparent">
            Delete Account
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}
