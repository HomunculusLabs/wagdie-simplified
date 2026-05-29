'use client'

import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Button } from '@/components/ui'
import { usePersonaAssistant } from '@/hooks/usePersonaAssistant'
import type { PersonaAssistantEditableDraft } from '@/types/eliza'
import { AssistantTranscript } from './AssistantTranscript'
import { ProposalReviewCard, type PersonaAssistantPresentation } from './ProposalReviewCard'

interface PersonaAssistantPanelProps {
  tokenId: string
  isOwner: boolean
  isConnected: boolean
  disabled?: boolean
  presentation?: PersonaAssistantPresentation
  getAssistantSnapshot: () => PersonaAssistantEditableDraft
  applyAssistantDraft: (draft: PersonaAssistantEditableDraft) => void
}

function PersonaAssistantPanelComponent({
  tokenId,
  isOwner,
  isConnected,
  disabled = false,
  presentation = 'standard',
  getAssistantSnapshot,
  applyAssistantDraft,
}: PersonaAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [composerValue, setComposerValue] = useState('')
  const [hasAppliedProposal, setHasAppliedProposal] = useState(false)
  const proposalRef = useRef<HTMLDivElement | null>(null)

  const assistant = usePersonaAssistant({ tokenId, getAssistantSnapshot })

  const isUnavailable = assistant.errorCode === 'ASSISTANT_UNAVAILABLE'
  const isInteractionDisabled = disabled || !isOwner || !isConnected || isUnavailable || assistant.isLoading
  const trimmedComposerValue = composerValue.trim()

  useEffect(() => {
    if (!assistant.pendingProposal) return

    proposalRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [assistant.pendingProposal])

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isInteractionDisabled || !trimmedComposerValue) return

    void assistant.sendMessage(trimmedComposerValue)
    setComposerValue('')
    setHasAppliedProposal(false)
  }, [assistant, isInteractionDisabled, trimmedComposerValue])

  const handleGenerate = useCallback(() => {
    if (isInteractionDisabled) return

    void assistant.generateDraft(trimmedComposerValue || undefined)
    setComposerValue('')
    setHasAppliedProposal(false)
  }, [assistant, isInteractionDisabled, trimmedComposerValue])

  const handleApplyProposal = useCallback(() => {
    if (!assistant.pendingProposal || isInteractionDisabled) return

    applyAssistantDraft(assistant.pendingProposal)
    assistant.discardProposal()
    setHasAppliedProposal(true)
  }, [applyAssistantDraft, assistant, isInteractionDisabled])

  const handleDiscardProposal = useCallback(() => {
    assistant.discardProposal()
    setHasAppliedProposal(false)
  }, [assistant])

  const handleClearConversation = useCallback(() => {
    assistant.clearConversation()
    setComposerValue('')
    setHasAppliedProposal(false)
  }, [assistant])

  if (!isOwner) {
    return null
  }

  const headerContent = (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-display uppercase tracking-widest text-neutral-200">
            Persona Assistant
          </h3>
          {assistant.pendingProposal && (
            <span className="rounded-full border border-soul-700 bg-soul-900/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-soul-300">
              Draft ready
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Chat, generate a proposal, apply it to the editor, then use Save AI Persona.
        </p>
      </div>
    </>
  )

  return (
    <div className={presentation === 'sidebar' ? 'border-b border-neutral-800 bg-neutral-950/50' : 'rounded-xl border border-neutral-800 bg-neutral-950/50'} data-presentation={presentation}>
      {presentation === 'sidebar' ? (
        <div className="sr-only">{headerContent}</div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-500"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
        >
          {headerContent}
        <svg
          className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        </button>
      )}

      {(isOpen || presentation === 'sidebar') && (
        <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
          <Alert title="Two-step workflow" className="bg-black/20">
            Generate a draft, apply it to the editor, then Save AI Persona to persist.
          </Alert>

          {!isConnected && (
            <Alert title="Connect wallet required" variant="warning">
              Connect your wallet to use the owner-facing persona assistant.
            </Alert>
          )}

          {isUnavailable && (
            <Alert title="Assistant unavailable" variant="warning">
              Persona assistant inference is not configured right now. You can still edit and save persona fields manually.
            </Alert>
          )}

          {assistant.error && !isUnavailable && (
            <div className="rounded-lg border border-red-800/50 bg-red-900/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-red-300">{assistant.error}</p>
                <button
                  type="button"
                  onClick={assistant.clearError}
                  className="text-red-300 hover:text-red-200"
                  aria-label="Dismiss assistant error"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {hasAppliedProposal && (
            <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-3">
              <p className="text-sm text-emerald-300">
                Draft applied to the editor. Review the fields below, make any edits, then click Save AI Persona to persist.
              </p>
            </div>
          )}

          {assistant.pendingProposal && (
            <div ref={proposalRef} data-testid="persona-assistant-pending-proposal">
              <ProposalReviewCard
                proposal={assistant.pendingProposal}
                warnings={assistant.warnings}
                isGenerating={assistant.isGenerating}
                disabled={isInteractionDisabled}
                presentation={presentation}
                onApply={handleApplyProposal}
                onRegenerate={handleGenerate}
                onDiscard={handleDiscardProposal}
              />
            </div>
          )}

          <AssistantTranscript messages={assistant.messages} isLoading={assistant.isLoading} />

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              disabled={isInteractionDisabled}
              rows={3}
              placeholder="Describe the voice, tone, memories, topics, or instructions you want the persona draft to include…"
              className="min-h-[96px] w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-soul-500 focus:outline-none focus:ring-1 focus:ring-soul-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Persona assistant message"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  isLoading={assistant.isSending}
                  disabled={isInteractionDisabled || !trimmedComposerValue}
                >
                  Send chat
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleGenerate}
                  isLoading={assistant.isGenerating}
                  disabled={isInteractionDisabled}
                >
                  Generate draft
                </Button>
              </div>

              {(assistant.messages.length > 0 || assistant.pendingProposal) && (
                <button
                  type="button"
                  onClick={handleClearConversation}
                  disabled={assistant.isLoading}
                  className="text-xs text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear assistant
                </button>
              )}
            </div>
          </form>

        </div>
      )}
    </div>
  )
}

export const PersonaAssistantPanel = memo(PersonaAssistantPanelComponent)
