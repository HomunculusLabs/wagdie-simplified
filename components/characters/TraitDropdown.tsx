/**
 * TraitDropdown Component
 * Generic dropdown filter for character traits (Armor, Back, Mask, etc.)
 * WAGDIE themed styling
 */

'use client'

import React, { useState, useRef } from 'react'
import type { TraitCount } from '@/types/character'
import { Spinner } from '@/components/ui/Spinner'
import { useDismissibleLayer } from '@/hooks/useDismissibleLayer'

interface TraitDropdownProps {
  /** The trait type label (e.g., "Armor", "Back", "Mask") */
  label: string
  /** Currently selected value */
  value: string | null
  /** Available options with counts */
  options: TraitCount[]
  /** Callback when selection changes */
  onChange: (value: string | null) => void
  /** Disable the dropdown */
  disabled?: boolean
  /** Show loading state */
  isLoading?: boolean
  /** Additional CSS classes */
  className?: string
}

export function TraitDropdown({
  label,
  value,
  options,
  onChange,
  disabled = false,
  isLoading = false,
  className = ''
}: TraitDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useDismissibleLayer(dropdownRef, {
    enabled: isOpen,
    onDismiss: () => setIsOpen(false),
    dismissOnOutsideMouseDown: true,
    dismissOnEscape: true
  })

  const selectedOption = options.find(o => o.value === value)
  const displayValue = selectedOption ? selectedOption.value : `All ${label}`

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`
          flex min-h-11 items-center gap-2 px-3 py-2 min-w-[140px]
          bg-midnight/45 border
          font-ui text-sm tracking-wide
          transition-all duration-200
          ${isOpen ? 'border-arcane-bright text-arcane-bright' : 'border-midnight-light/70 text-ash'}
          ${disabled || isLoading ? 'cursor-not-allowed opacity-50' : 'hover:border-arcane-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright'}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Filter by ${label}`}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" />
            Loading...
          </span>
        ) : (
          <>
            <span className="flex-1 text-left truncate text-[14px]">{displayValue}</span>
            {value && selectedOption && (
              <span className="text-[12px] text-neutral-500">
                ({selectedOption.count})
              </span>
            )}
            <svg
              className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && !isLoading && (
        <div
          className="absolute z-50 mt-1 w-64 max-h-72 overflow-y-auto
            border border-midnight-light/70 bg-soul-950 shadow-xl"
          role="listbox"
          aria-label={`${label} options`}
        >
          {/* Clear option */}
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setIsOpen(false)
            }}
            className={`
              min-h-11 w-full px-3 py-2 text-left font-ui text-sm tracking-wide
              transition-colors hover:bg-arcane/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-arcane-bright
              ${!value ? 'bg-arcane/10 text-arcane-bright' : 'text-ash'}
            `}
            role="option"
            aria-selected={!value}
          >
            All {label}
          </button>

          <div className="border-t border-midnight-light/50" />

          {/* Trait options */}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`
                flex min-h-11 w-full items-center justify-between px-3 py-2 text-left font-ui text-sm
                transition-colors hover:bg-arcane/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-arcane-bright
                ${value === option.value ? 'bg-arcane/10 text-arcane-bright' : 'text-bone'}
              `}
              role="option"
              aria-selected={value === option.value}
            >
              <span className="truncate">{option.value}</span>
              <span className="text-[12px] text-neutral-500 ml-2">
                {option.count}
              </span>
            </button>
          ))}

          {options.length === 0 && (
            <div className="px-3 py-4 text-center text-md text-neutral-500">
              No {label.toLowerCase()} options available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
