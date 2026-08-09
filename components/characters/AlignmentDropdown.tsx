/**
 * AlignmentDropdown Component
 * Dropdown filter for character alignments (D&D style)
 * WAGDIE themed styling
 */

'use client'

import React, { useState, useRef } from 'react'
import type { AlignmentCount } from '@/types/character'
import { Spinner } from '@/components/ui/Spinner'
import { useDismissibleLayer } from '@/hooks/useDismissibleLayer'

interface AlignmentDropdownProps {
  value: string | null
  options: AlignmentCount[]
  onChange: (alignment: string | null) => void
  disabled?: boolean
  isLoading?: boolean
  className?: string
}

// Define alignment order for consistent display
const ALIGNMENT_ORDER = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
  'Unknown'
]

export function AlignmentDropdown({
  value,
  options,
  onChange,
  disabled = false,
  isLoading = false,
  className = ''
}: AlignmentDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sort options by defined order
  const sortedOptions = [...options].sort((a, b) => {
    const indexA = ALIGNMENT_ORDER.indexOf(a.alignment)
    const indexB = ALIGNMENT_ORDER.indexOf(b.alignment)
    // Unknown values go to end
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
  })

  useDismissibleLayer(dropdownRef, {
    enabled: isOpen,
    onDismiss: () => setIsOpen(false),
    dismissOnOutsideMouseDown: true,
    dismissOnEscape: true
  })

  const selectedAlignment = options.find(o => o.alignment === value)
  const displayValue = selectedAlignment ? selectedAlignment.alignment : 'All Alignments'

  // Get alignment color based on moral axis
  const getAlignmentColor = (alignment: string) => {
    if (alignment.includes('Good')) return 'text-emerald-400'
    if (alignment.includes('Evil')) return 'text-red-400'
    return 'text-neutral-300'
  }

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`
          flex min-h-11 items-center gap-2 px-3 py-2 min-w-[170px]
          bg-midnight/45 border
          font-ui text-sm tracking-wide
          transition-all duration-200
          ${isOpen ? 'border-arcane-bright text-arcane-bright' : 'border-midnight-light/70 text-ash'}
          ${disabled || isLoading ? 'cursor-not-allowed opacity-50' : 'hover:border-arcane-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright'}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" />
            Loading...
          </span>
        ) : (
          <>
            <span className="flex-1 text-left truncate text-sm">{displayValue}</span>
            {value && (
              <span className="text-[12px] text-neutral-500">
                ({selectedAlignment?.count})
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
          className="absolute z-50 mt-1 w-56 max-h-80 overflow-y-auto
            border border-midnight-light/70 bg-soul-950 shadow-xl"
          role="listbox"
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
            All Alignments
          </button>

          <div className="border-t border-midnight-light/50" />

          {/* Alignment options */}
          {sortedOptions.map((option) => (
            <button
              key={option.alignment}
              type="button"
              onClick={() => {
                onChange(option.alignment)
                setIsOpen(false)
              }}
              className={`
                flex min-h-11 w-full items-center justify-between px-3 py-2 text-left font-ui text-sm
                transition-colors hover:bg-arcane/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-arcane-bright
                ${value === option.alignment ? 'bg-arcane/10 text-arcane-bright' : getAlignmentColor(option.alignment)}
              `}
              role="option"
              aria-selected={value === option.alignment}
            >
              <span className="truncate">{option.alignment}</span>
              <span className="text-[12px] text-neutral-500 ml-2">
                {option.count}
              </span>
            </button>
          ))}

          {options.length === 0 && (
            <div className="px-3 py-4 text-center text-md text-neutral-500">
              No alignments available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
