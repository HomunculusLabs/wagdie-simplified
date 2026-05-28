import { memo, type ReactNode } from 'react'
import { Button } from '@/components/ui'
import type { PersonaAssistantEditableDraft, StyleConfig } from '@/types/eliza'

export type PersonaAssistantPresentation = 'standard' | 'sidebar'

interface ProposalReviewCardProps {
  proposal: PersonaAssistantEditableDraft
  warnings: string[]
  isGenerating?: boolean
  disabled?: boolean
  presentation?: PersonaAssistantPresentation
  onApply: () => void
  onRegenerate: () => void
  onDiscard: () => void
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasItems(value: unknown[] | undefined): value is unknown[] {
  return Array.isArray(value) && value.length > 0
}

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function ProposalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-black/20 p-3">
      <h5 className="mb-2 text-xs font-display uppercase tracking-widest text-neutral-400">{title}</h5>
      {children}
    </section>
  )
}

function TextValue({ value }: { value: string | null | undefined }) {
  if (!hasText(value)) return <p className="text-sm text-neutral-500">Will clear this field.</p>

  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{value}</p>
}

function ListValue({ items }: { items: string[] | undefined }) {
  if (!items) return null
  if (items.length === 0) return <p className="text-sm text-neutral-500">Will clear this list.</p>

  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-200">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  )
}

function StyleValue({ style }: { style: StyleConfig }) {
  const groups = [
    ['All', style.all],
    ['Chat', style.chat],
    ['Post', style.post],
  ] as const
  const visibleGroups = groups.filter(([, items]) => items !== undefined)

  if (visibleGroups.length === 0) {
    return <p className="text-sm text-neutral-500">Will clear style guidelines.</p>
  }

  return (
    <div className="space-y-3">
      {visibleGroups.map(([label, items]) => (
        <div key={label}>
          <p className="mb-1 text-xs uppercase tracking-widest text-neutral-500">{label}</p>
          <ListValue items={items} />
        </div>
      ))}
    </div>
  )
}

function ProposalReviewCardComponent({
  proposal,
  warnings,
  isGenerating = false,
  disabled = false,
  presentation = 'standard',
  onApply,
  onRegenerate,
  onDiscard,
}: ProposalReviewCardProps) {
  const hasTemplates = hasOwn(proposal, 'templates') && proposal.templates !== undefined
  const hasSettings = hasOwn(proposal, 'settings') && proposal.settings !== undefined
  const isSidebar = presentation === 'sidebar'

  return (
    <div className="rounded-xl border border-soul-800/60 bg-soul-950/30 p-4" data-presentation={presentation}>
      <div className={`mb-4 flex flex-col gap-2 ${isSidebar ? '' : 'sm:flex-row sm:items-start sm:justify-between'}`}>
        <div>
          <h4 className="font-display text-lg text-neutral-100">Review assistant draft</h4>
          <p className="text-sm text-neutral-400">
            Nothing changes until you apply this proposal to the editor.
          </p>
        </div>
        <div className={`flex gap-2 ${isSidebar ? 'flex-col' : 'flex-wrap'}`}>
          <Button variant="primary" size="sm" onClick={onApply} disabled={disabled}>
            Apply to editor
          </Button>
          <Button variant="secondary" size="sm" onClick={onRegenerate} isLoading={isGenerating} disabled={disabled}>
            Regenerate
          </Button>
          <Button variant="secondary" size="sm" onClick={onDiscard} disabled={disabled || isGenerating}>
            Discard
          </Button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-900/20 p-3">
          <p className="mb-1 text-sm font-medium text-amber-300">Assistant warnings</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200/90">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={`grid gap-3 ${isSidebar ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
        {'username' in proposal && (
          <ProposalSection title="Username">
            <TextValue value={proposal.username} />
          </ProposalSection>
        )}

        {'backstory' in proposal && (
          <ProposalSection title="Backstory">
            <TextValue value={proposal.backstory} />
          </ProposalSection>
        )}

        {'system' in proposal && (
          <ProposalSection title="System prompt">
            <TextValue value={proposal.system} />
          </ProposalSection>
        )}

        {proposal.bio !== undefined && (
          <ProposalSection title="Bio">
            <ListValue items={proposal.bio} />
          </ProposalSection>
        )}

        {proposal.lore !== undefined && (
          <ProposalSection title="Lore">
            <ListValue items={proposal.lore} />
          </ProposalSection>
        )}

        {proposal.topics !== undefined && (
          <ProposalSection title="Topics">
            <ListValue items={proposal.topics} />
          </ProposalSection>
        )}

        {proposal.adjectives !== undefined && (
          <ProposalSection title="Adjectives">
            <ListValue items={proposal.adjectives} />
          </ProposalSection>
        )}

        {proposal.style !== undefined && (
          <ProposalSection title="Style">
            <StyleValue style={proposal.style} />
          </ProposalSection>
        )}

        {proposal.exampleMessages !== undefined && (
          <ProposalSection title="Example messages">
            {hasItems(proposal.exampleMessages) ? (
              <div className="space-y-3">
                {proposal.exampleMessages.map((example, index) => (
                  <div key={`${example.userMessage}-${index}`} className="space-y-1 text-sm">
                    <p className="text-neutral-400">User: <span className="text-neutral-200">{example.userMessage}</span></p>
                    <p className="text-neutral-400">Assistant: <span className="text-neutral-200">{example.assistantMessage}</span></p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Will clear example messages.</p>
            )}
          </ProposalSection>
        )}

        {proposal.postExamples !== undefined && (
          <ProposalSection title="Post examples">
            <ListValue items={proposal.postExamples} />
          </ProposalSection>
        )}

        {hasTemplates && (
          <ProposalSection title="Templates">
            {Object.keys(proposal.templates || {}).length > 0 ? (
              <dl className="space-y-2 text-sm">
                {Object.entries(proposal.templates || {}).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs uppercase tracking-widest text-neutral-500">{key}</dt>
                    <dd className="whitespace-pre-wrap text-neutral-200">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-neutral-500">Will clear custom templates.</p>
            )}
          </ProposalSection>
        )}

        {hasSettings && (
          <ProposalSection title="Safe settings">
            {Object.keys(proposal.settings || {}).length > 0 ? (
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-300">
                {JSON.stringify(proposal.settings, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-neutral-500">No safe setting changes.</p>
            )}
          </ProposalSection>
        )}
      </div>
    </div>
  )
}

export const ProposalReviewCard = memo(ProposalReviewCardComponent)
