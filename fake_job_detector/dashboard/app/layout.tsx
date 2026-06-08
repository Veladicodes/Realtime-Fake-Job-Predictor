import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { CursorGlow } from "@/components/cursor-glow"
import { ThemeProvider } from "@/components/theme-provider"
import { DashboardProvider } from "@/context/dashboard-context"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
})

// All routes are dynamic — pages pull live data from the API at request time
// and must not be statically pre-rendered (which would fail without a running API).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"),
  title: {
    default: "Real-Time Fake Job Detection System",
    template: "%s | Fake Job Detection",
  },
  description: "System interface for real-time fake job detection powered by Kafka, Spark, ML, and PostgreSQL.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#050505",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <div aria-hidden className="ambient-system-bg">
          <span className="ambient-blob ambient-blob-1" />
          <span className="ambient-blob ambient-blob-2" />
          <span className="ambient-blob ambient-blob-3" />
        </div>
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          enableSystem={false}
          storageKey="theme-mode"
        >
          <DashboardProvider>
            <CursorGlow />
            {children}
          </DashboardProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
