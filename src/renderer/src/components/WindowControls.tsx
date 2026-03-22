import { useState } from 'react'

function WindowControls(): JSX.Element {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="flex items-center gap-2 titlebar-no-drag"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Close */}
      <button
        onClick={() => window.api.windowClose()}
        className="group h-3 w-3 rounded-full bg-[#ff5f57] flex items-center justify-center transition-colors hover:bg-[#ff5f57]/80 focus:outline-none"
        aria-label="Close"
      >
        {hovered && (
          <svg width="6" height="6" viewBox="0 0 6 6" className="text-black/60">
            <path d="M0.5 0.5L5.5 5.5M5.5 0.5L0.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {/* Minimize */}
      <button
        onClick={() => window.api.windowMinimize()}
        className="group h-3 w-3 rounded-full bg-[#febc2e] flex items-center justify-center transition-colors hover:bg-[#febc2e]/80 focus:outline-none"
        aria-label="Minimize"
      >
        {hovered && (
          <svg width="6" height="2" viewBox="0 0 6 2" className="text-black/60">
            <path d="M0.5 1H5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {/* Maximize */}
      <button
        onClick={() => window.api.windowMaximize()}
        className="group h-3 w-3 rounded-full bg-[#28c840] flex items-center justify-center transition-colors hover:bg-[#28c840]/80 focus:outline-none"
        aria-label="Maximize"
      >
        {hovered && (
          <svg width="6" height="6" viewBox="0 0 6 6" className="text-black/60">
            <path d="M1 1.5H4.5V5M5 4.5H1.5V1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}

export default WindowControls
