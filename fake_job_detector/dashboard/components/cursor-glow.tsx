"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function CursorGlow() {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [isEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
  const frameRef = useRef<number | null>(null)
  const pendingPositionRef = useRef({ x: 0, y: 0 })

  const flushPosition = useCallback(() => {
    frameRef.current = null
    setPosition(pendingPositionRef.current)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    pendingPositionRef.current = { x: e.clientX, y: e.clientY }

    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(flushPosition)
    }

    setIsVisible(true)
  }, [flushPosition])

  useEffect(() => {
    if (!isEnabled) {
      return
    }

    const handleMouseLeave = () => {
      setIsVisible(false)
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true })
    document.body.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
      window.removeEventListener("mousemove", handleMouseMove)
      document.body.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [handleMouseMove, isEnabled])

  if (!isEnabled) {
    return null
  }

  return (
    <>
      <div
        className="cursor-glow hidden lg:block pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          opacity: isVisible ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}
      />
      <div
        className="hidden lg:block pointer-events-none fixed h-6 w-6 rounded-full mix-blend-screen"
        style={{
          left: position.x,
          top: position.y,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
          opacity: isVisible ? 0.12 : 0,
          transition: "opacity 0.2s ease",
        }}
      />
    </>
  )
}
