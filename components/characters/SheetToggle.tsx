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
        inline-flex min-h-11 cursor-pointer select-none items-center gap-3 font-ui
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
          h-5 w-10 border transition-all duration-200
          ${checked
            ? 'border-arcane-bright bg-arcane/35'
            : 'border-midnight-light/70 bg-midnight/45 hover:border-arcane-muted'
          }
          peer-focus-visible:ring-2 peer-focus-visible:ring-arcane-bright
        `}>
          <div className={`
            absolute left-0.5 top-0.5 h-4 w-4 transition-transform duration-200
            ${checked
              ? 'translate-x-5 bg-arcane-bright'
              : 'translate-x-0 bg-mist'
            }
          `} />
        </div>
      </span>
      <span className="font-ui text-sm tracking-wide text-ash">
        {label}
      </span>
    </label>
  )
}
