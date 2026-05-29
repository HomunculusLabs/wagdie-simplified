/**
 * ArrayFieldEditor Component
 * Reusable editor for string array fields with add/edit/remove/reorder
 */

'use client'

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { CharacterCounter } from './CharacterCounter'

interface ArrayFieldEditorProps {
  /** Label for the field */
  label: string
  /** Help text displayed below the field */
  helpText?: string
  /** Array of string values */
  value: string[]
  /** Callback when values change */
  onChange: (value: string[]) => void
  /** Maximum number of items allowed */
  maxItems: number
  /** Maximum characters per item */
  maxCharsPerItem: number
  /** Placeholder text for new items */
  placeholder?: string
  /** Whether the field is disabled */
  disabled?: boolean
  /** Whether the field is read-only */
  readOnly?: boolean
  /** Minimum rows for textarea (default: 2) */
  minRows?: number
  /** Whether to show item indices (default: true) */
  showIndices?: boolean
  /** Input type: 'textarea' (default) or 'input' for single-line chips */
  inputType?: 'textarea' | 'input'
}

function ArrayFieldEditorComponent({
  label,
  helpText,
  value,
  onChange,
  maxItems,
  maxCharsPerItem,
  placeholder = 'Enter text...',
  disabled = false,
  readOnly = false,
  minRows = 2,
  showIndices = true,
  inputType = 'textarea',
}: ArrayFieldEditorProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const inputRefs = useRef<(HTMLTextAreaElement | HTMLInputElement | null)[]>([])

  // Focus the new item input after adding
  useEffect(() => {
    if (focusedIndex !== null && inputRefs.current[focusedIndex]) {
      inputRefs.current[focusedIndex]?.focus()
    }
  }, [focusedIndex, value.length])

  const handleAdd = useCallback(() => {
    if (value.length < maxItems && !readOnly && !disabled) {
      const newValue = [...value, '']
      onChange(newValue)
      setFocusedIndex(newValue.length - 1)
    }
  }, [value, maxItems, readOnly, disabled, onChange])

  const handleUpdate = useCallback(
    (index: number, newText: string) => {
      if (readOnly || disabled) return
      const newValue = [...value]
      newValue[index] = newText
      onChange(newValue)
    },
    [value, readOnly, disabled, onChange]
  )

  const handleRemove = useCallback(
    (index: number) => {
      if (readOnly || disabled) return
      const newValue = value.filter((_, i) => i !== index)
      onChange(newValue)
      setFocusedIndex(null)
    },
    [value, readOnly, disabled, onChange]
  )

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0 || readOnly || disabled) return
      const newValue = [...value]
      ;[newValue[index - 1], newValue[index]] = [newValue[index], newValue[index - 1]]
      onChange(newValue)
    },
    [value, readOnly, disabled, onChange]
  )

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index === value.length - 1 || readOnly || disabled) return
      const newValue = [...value]
      ;[newValue[index], newValue[index + 1]] = [newValue[index + 1], newValue[index]]
      onChange(newValue)
    },
    [value, readOnly, disabled, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'Backspace' && value[index] === '' && value.length > 1) {
        e.preventDefault()
        handleRemove(index)
        // Focus previous input
        if (index > 0) {
          setFocusedIndex(index - 1)
        }
      }
    },
    [value, handleRemove]
  )

  const canAdd = value.length < maxItems && !readOnly && !disabled
  const remainingItems = maxItems - value.length

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xl font-display text-neutral-400">
          {label}
        </label>
        <span className="text-md text-neutral-500">
          {value.length} / {maxItems} items
        </span>
      </div>

      {/* Items list */}
      <div className={`space-y-2 ${showIndices && inputType === 'textarea' ? 'pl-6' : ''}`}>
        {value.map((item, index) => {
          const isOverLimit = item.length > maxCharsPerItem

          return (
            <div
              key={index}
              className={`group relative ${
                inputType === 'input' ? 'flex items-center gap-2' : ''
              }`}
            >
              {/* Index badge */}
              {showIndices && inputType === 'textarea' && (
                <div className="absolute -left-5 top-2 text-xs text-neutral-600 font-mono">
                  {index + 1}
                </div>
              )}

              {/* Input */}
              <div className="flex-1">
                {inputType === 'textarea' ? (
                  <textarea
                    ref={(el) => {
                      inputRefs.current[index] = el
                    }}
                    value={item}
                    onChange={(e) => handleUpdate(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    disabled={disabled}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    rows={minRows}
                    className={`
                      w-full px-3 py-2
                      bg-neutral-900 border rounded-lg
                      text-lg text-neutral-100 placeholder-neutral-500
                      focus:outline-none focus:ring-1
                      ${
                        isOverLimit
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : 'border-neutral-700 focus:border-soul-500 focus:ring-soul-500'
                      }
                      ${readOnly ? 'bg-neutral-900/50 cursor-not-allowed' : ''}
                      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                      resize-y min-h-[60px]
                    `}
                  />
                ) : (
                  <input
                    ref={(el) => {
                      inputRefs.current[index] = el
                    }}
                    type="text"
                    value={item}
                    onChange={(e) => handleUpdate(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    disabled={disabled}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    className={`
                      w-full px-3 py-1.5
                      bg-neutral-900 border rounded-full
                      text-lg text-neutral-100 placeholder-neutral-500
                      focus:outline-none focus:ring-1
                      ${
                        isOverLimit
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : 'border-neutral-700 focus:border-soul-500 focus:ring-soul-500'
                      }
                      ${readOnly ? 'bg-neutral-900/50 cursor-not-allowed' : ''}
                      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  />
                )}
              </div>

              {/* Actions */}
              {!readOnly && !disabled && (
                <div
                  className={`flex items-center gap-1 ${
                    inputType === 'textarea'
                      ? 'absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity'
                      : ''
                  }`}
                >
                  {/* Move up */}
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                      aria-label={`Move item ${index + 1} up`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}

                  {/* Move down */}
                  {index < value.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                      aria-label={`Move item ${index + 1} down`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                    aria-label={`Remove item ${index + 1}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Character count for textarea */}
              {inputType === 'textarea' && (
                <div className="flex justify-end mt-1">
                  <CharacterCounter current={item.length} max={maxCharsPerItem} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add button */}
      {canAdd && (
        <button
          type="button"
          onClick={handleAdd}
          className={`
            flex items-center gap-2 px-3 py-2
            text-lg text-neutral-400 hover:text-neutral-200
            border border-dashed border-neutral-700 rounded-lg
            hover:border-neutral-500 transition-colors
            w-full justify-center
          `}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add {label.replace(/s$/, '')}
          {remainingItems > 0 && (
            <span className="text-neutral-600">({remainingItems} remaining)</span>
          )}
        </button>
      )}

      {/* Help text */}
      {helpText && (
        <p className="text-md text-neutral-500">{helpText}</p>
      )}
    </div>
  )
}

export const ArrayFieldEditor = memo(ArrayFieldEditorComponent)
