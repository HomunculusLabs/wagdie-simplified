/**
 * SheetToggle Component
 * Toggle filter for characters with custom character sheets
 * WAGDIE themed styling
 */

'use client'

import React from 'react'

interface SheetToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  title?: string
  className?: string
}

export function SheetToggle({
  checked,
  onChange,
  disabled = false,
  label = 'Has Sheet',
  title = 'Show only characters with imported character sheet data',
  className = ''
}: SheetToggleProps) {
  return (
    <label
      className={`
        inline-flex items-center gap-2 cursor-pointer select-none
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      title={title}
    >
      <span className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className={`
          w-10 h-5 rounded-sm border transition-all duration-200
          ${checked
            ? 'bg-soul-accent/30 border-soul-accent'
            : 'bg-black/40 border-neutral-700 hover:border-neutral-600'
          }
          peer-focus:ring-2 peer-focus:ring-soul-accent/30
        `}>
          <div className={`
            absolute top-0.5 left-0.5 w-4 h-4 rounded-sm transition-transform duration-200
            ${checked
              ? 'translate-x-5 bg-soul-accent'
              : 'translate-x-0 bg-neutral-600'
            }
          `} />
        </div>
      </span>
      {/* REPOMARK:SCOPE: 1 - Replace font-display with font-eskapade for SheetToggle label text (UI font contract) */}
      <span className="text-md font-eskapade  tracking-wider text-neutral-400">
        {label}
      </span>
    </label>
  )
}
