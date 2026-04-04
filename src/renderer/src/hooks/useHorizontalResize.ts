import { useState, useCallback, useRef, useEffect } from 'react'

interface UseHorizontalResizeOptions {
  initial: number
  min?: number
  max?: number
}

export function useHorizontalResize({ initial, min = 320, max }: UseHorizontalResizeOptions) {
  const [width, setWidth] = useState(initial)
  const dragging = useRef(false)
  const rafId = useRef(0)
  const listenersRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(null)

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        document.removeEventListener('mousemove', listenersRef.current.onMove)
        document.removeEventListener('mouseup', listenersRef.current.onUp)
        listenersRef.current = null
      }
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      cancelAnimationFrame(rafId.current)
    }
  }, [])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    let pending = 0

    const apply = (): void => {
      if (dragging.current && pending > 0) setWidth(pending)
    }

    const onMove = (ev: MouseEvent): void => {
      if (!dragging.current) return
      const newWidth = window.innerWidth - ev.clientX
      const maxW = max ?? window.innerWidth - 260
      pending = Math.min(Math.max(newWidth, min), maxW)
      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(apply)
    }

    const onUp = (): void => {
      dragging.current = false
      cancelAnimationFrame(rafId.current)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      listenersRef.current = null
    }

    listenersRef.current = { onMove, onUp }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [min, max])

  return { width, handleDragStart }
}
