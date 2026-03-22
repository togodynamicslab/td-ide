import { useCallback, useEffect, useRef } from 'react'

interface ResizeHandleProps {
  onResize: (height: number) => void
  minHeight?: number
  maxHeight?: number
}

export default function ResizeHandle({ onResize, minHeight = 150, maxHeight }: ResizeHandleProps): JSX.Element {
  const dragging = useRef(false)
  const rafId = useRef(0)

  // Cleanup body styles if component unmounts during drag
  useEffect(() => {
    return () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        cancelAnimationFrame(rafId.current)
      }
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true

      const containerBottom = window.innerHeight
      let pendingHeight = 0

      const applyResize = (): void => {
        if (dragging.current && pendingHeight > 0) {
          onResize(pendingHeight)
        }
      }

      const handleMouseMove = (ev: MouseEvent): void => {
        if (!dragging.current) return
        const newHeight = containerBottom - ev.clientY
        const max = maxHeight || window.innerHeight - 200
        pendingHeight = Math.min(Math.max(newHeight, minHeight), max)
        cancelAnimationFrame(rafId.current)
        rafId.current = requestAnimationFrame(applyResize)
      }

      const handleMouseUp = (): void => {
        dragging.current = false
        cancelAnimationFrame(rafId.current)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [onResize, minHeight, maxHeight]
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-1 cursor-row-resize bg-td-border hover:bg-td-accent transition-colors shrink-0"
    />
  )
}
