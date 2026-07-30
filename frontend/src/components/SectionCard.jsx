import { useState, useEffect } from 'react'
import api from '../api/client'
import { describeError } from '../lib/errors'
import './SectionCard.css'

export default function SectionCard({ projectId, section, onUpdated, onApproved }) {
  const [draft, setDraft] = useState(null)       // current latest SectionVersion {content, citations}
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [showFeedbackBox, setShowFeedbackBox] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [useWeb, setUseWeb] = useState(true)
  const [useRag, setUseRag] = useState(true)
  const [versionHistory, setVersionHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [guidance, setGuidance] = useState('')
  const [errorAction, setErrorAction] = useState(null) // 'draft' | 'regenerate' | 'approve' | null

  const isDraftingFirst = !draft && busy
  const isRegeneratingDraft = Boolean(draft) && !editing && showFeedbackBox && busy
  const isPipelineActive = isDraftingFirst || isRegeneratingDraft

  useEffect(() => {
    if (!isPipelineActive) return undefined
    setElapsed(0)
    const timer = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [isPipelineActive])

  useEffect(() => {
    setError('')
    setErrorAction(null)
    setShowFeedbackBox(false)
    setFeedback('')
    setEditing(false)

    if (section.status === 'approved') {
      setDraft({ content: section.approved_content, citations: '[]' })
    } else {
      loadLatestVersion()
    }
  }, [section.id])

  async function loadLatestVersion() {
    try {
      const versions = await api.listVersions(section.id)
      setVersionHistory(versions)
      if (versions.length > 0) {
        setDraft(versions[versions.length - 1])
      } else {
        setDraft(null)
      }
    } catch {
      setDraft(null)
    }
  }

  async function handleGenerateFirstDraft() {
    setBusy(true)
    setError('')
    try {
      const version = await api.draftSection(section.id, {
        instructions: guidance.trim() || section.instructions,
        use_web_search: useWeb,
        use_rag: useRag,
      })
      setDraft(version)
      onUpdated({ ...section, status: 'awaiting_review' })
    } catch (err) {
      setError(describeError(err, 'Drafting failed. Check your API keys in backend/.env.'))
      setErrorAction('draft')
    } finally {
      setBusy(false)
    }
  }

  async function handleRegenerate() {
    if (!feedback.trim()) return
    setBusy(true)
    setError('')
    try {
      const version = await api.regenerateSection(section.id, feedback.trim(), { use_web_search: useWeb, use_rag: useRag })
      setDraft(version)
      setFeedback('')
      setShowFeedbackBox(false)
      const versions = await api.listVersions(section.id)
      setVersionHistory(versions)
    } catch (err) {
      setError(describeError(err, 'Regeneration failed'))
      setErrorAction('regenerate')
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove() {
    setBusy(true)
    setError('')
    try {
      const updated = await api.approveSection(section.id)
      onUpdated(updated)
      onApproved()
    } catch (err) {
      setError(describeError(err, 'Could not approve section'))
      setErrorAction('approve')
    } finally {
      setBusy(false)
    }
  }

  function handleRetryError() {
    if (errorAction === 'draft') handleGenerateFirstDraft()
    else if (errorAction === 'regenerate') handleRegenerate()
    else if (errorAction === 'approve') handleApprove()
  }

  async function handleSaveEdit() {
    setBusy(true)
    setError('')
    try {
      const updated = await api.editApprovedSection(section.id, editedText)
      onUpdated(updated)
      setDraft({ content: editedText, citations: '[]' })
      setEditing(false)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save edit')
    } finally {
      setBusy(false)
    }
  }

  const citations = draft ? safeParse(draft.citations) : []
  const wordCount = draft ? countWords(draft.content) : 0
  const withinTarget = section.word_target > 0 && Math.abs(wordCount - section.word_target) / section.word_target <= 0.15

  return (
    <div className="section-card">
      <header className="section-card__header">
        <div>
          <span className="section-card__eyebrow">{statusLabel(section.status)}</span>
          <h2>{section.title}</h2>
        </div>
        <span className="section-card__target">
          {draft ? (
            section.word_target > 0 ? (
              <>
                <span className={`section-card__count ${withinTarget ? 'section-card__count--good' : 'section-card__count--off'}`}>
                  {wordCount}
                </span> / {section.word_target} words
              </>
            ) : (
              `${wordCount} words`
            )
          ) : (
            `~${section.word_target} words`
          )}
        </span>
      </header>

      {section.instructions && (
        <p className="section-card__notes">{section.instructions}</p>
      )}

      {/* No draft yet — show generate controls, or the pipeline while drafting */}
      {!draft && (
        isDraftingFirst ? (
          renderDraftPipeline('Drafting this section', buildDraftStages(useRag, useWeb, false), elapsed)
        ) : (
          <div className="section-card__empty">
            <div className="section-card__toggles">
              <label><input type="checkbox" checked={useRag} onChange={e => setUseRag(e.target.checked)} /> Use my uploaded sources</label>
              <label><input type="checkbox" checked={useWeb} onChange={e => setUseWeb(e.target.checked)} /> Search the web for this section</label>
            </div>
            <label className="section-card__guidance">
              <span className="section-card__guidance-label">Guidance for this section (optional)</span>
              <textarea
                className="section-card__guidance-input"
                value={guidance}
                onChange={e => setGuidance(e.target.value)}
                placeholder="e.g. Focus on work published after 2023, or keep the tone non-technical"
                rows={3}
              />
            </label>
            {error && (
              <div className="section-card__error-row">
                <p className="section-card__error">{error}</p>
                <button type="button" className="btn btn--ghost" onClick={handleRetryError} disabled={busy}>
                  {busy ? 'Retrying…' : 'Try again'}
                </button>
              </div>
            )}
            <button className="btn btn--primary" onClick={handleGenerateFirstDraft} disabled={busy}>
              {busy ? 'Drafting…' : `Draft "${section.title}" →`}
            </button>
          </div>
        )
      )}

      {/* Draft exists — show it for review, or the pipeline while regenerating */}
      {draft && !editing && (
        isRegeneratingDraft ? (
          renderDraftPipeline('Rewriting this section', buildDraftStages(useRag, useWeb, true), elapsed)
        ) : (
        <>
          <div className="section-card__draft">
            {renderMarkdown(draft.content)}
          </div>

          {citations.length > 0 && (
            <div className="section-card__citations">
              <h3 className="section-card__citations-heading">Sources used</h3>
              <ul className="section-card__citations-list">
                {citations.map((c, i) => (
                  <li key={i}>
                    <span className="section-card__citations-index">{pad(i + 1)}</span>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" title={c.source_name}>{truncate(c.source_name, 110)}</a>
                    ) : (
                      <span title={c.source_name}>{truncate(c.source_name, 110)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="section-card__error-row">
              <p className="section-card__error">{error}</p>
              <button type="button" className="btn btn--ghost" onClick={handleRetryError} disabled={busy}>
                {busy ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          )}

          {section.status !== 'approved' ? (
            <div className="section-card__actions">
              {!showFeedbackBox ? (
                <>
                  <button className="btn btn--ghost" onClick={() => setShowFeedbackBox(true)} disabled={busy}>
                    Not quite — regenerate
                  </button>
                  <button className="btn btn--ghost" onClick={() => { setEditing(true); setEditedText(draft.content) }} disabled={busy}>
                    Edit by hand
                  </button>
                  <button className="btn btn--primary" onClick={handleApprove} disabled={busy}>
                    {busy ? 'Approving…' : '✓ Approve & lock this section'}
                  </button>
                </>
              ) : (
                <div className="section-card__feedback">
                  <textarea
                    placeholder="What should change? e.g. 'Focus more on recent studies' or 'Make this shorter and less technical'"
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="section-card__toggles section-card__toggles--inline">
                    <label><input type="checkbox" checked={useRag} onChange={e => setUseRag(e.target.checked)} /> Sources</label>
                    <label><input type="checkbox" checked={useWeb} onChange={e => setUseWeb(e.target.checked)} /> Web search</label>
                  </div>
                  <div className="section-card__feedback-actions">
                    <button className="btn btn--ghost" onClick={() => setShowFeedbackBox(false)} disabled={busy}>Cancel</button>
                    <button className="btn btn--primary" onClick={handleRegenerate} disabled={busy || !feedback.trim()}>
                      {busy ? 'Rewriting…' : 'Regenerate with this feedback'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="section-card__actions">
              <span className="section-card__approved-label">✓ Approved and saved to your final report</span>
              <button className="btn btn--ghost" onClick={() => { setEditing(true); setEditedText(draft.content) }}>
                Edit
              </button>
            </div>
          )}

          {versionHistory.length > 1 && (
            <div className="section-card__history">
              <button className="section-card__history-toggle" onClick={() => setShowHistory(v => !v)}>
                {showHistory ? 'Hide' : 'Show'} {versionHistory.length - 1} earlier versions
              </button>
              {showHistory && (
                <>
                  <h3 className="section-card__history-heading">Version history</h3>
                  <ul className="section-card__history-list">
                    {versionHistory
                      .slice(0, -1)
                      .map((v, i) => ({ ...v, versionNumber: i + 1, nextFeedback: versionHistory[i + 1]?.feedback }))
                      .reverse()
                      .map(v => (
                        <li key={v.id}>
                          <div className="section-card__history-top">
                            <span className="section-card__history-label">Version {pad(v.versionNumber)}</span>
                            <button
                              className="btn btn--ghost btn--small"
                              onClick={() => { setEditing(true); setEditedText(v.content) }}
                            >
                              Use this version
                            </button>
                          </div>
                          {v.nextFeedback && <span className="section-card__history-feedback">Feedback: "{v.nextFeedback}"</span>}
                          <p>{truncate(v.content, 300)}</p>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
        )
      )}

      {/* Hand-edit mode */}
      {editing && (
        <div className="section-card__edit">
          <textarea
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
            rows={16}
            autoFocus
          />
          <div className="section-card__feedback-actions">
            <button className="btn btn--ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button className="btn btn--primary" onClick={handleSaveEdit} disabled={busy || !editedText.trim()}>
              {busy ? 'Saving…' : 'Save & approve'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function statusLabel(status) {
  return {
    pending: 'Not started',
    drafting: 'Drafting…',
    awaiting_review: 'Awaiting your review',
    approved: 'Approved',
  }[status] || status
}

function safeParse(json) {
  try { return JSON.parse(json) } catch { return [] }
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * The loader must reflect the user's actual choices — a stage that will not
 * run is never shown. Thresholds are rough estimates; the writing/rewriting
 * stage always stays "in progress" since the request only resolves when done.
 */
function buildDraftStages(useRag, useWeb, isRegenerating) {
  const stages = []
  let t = 0
  if (useRag) {
    stages.push({ name: 'Retrieving', description: 'Searching your indexed sources for relevant passages', threshold: t })
    t += 4
  }
  if (useWeb) {
    stages.push({ name: 'Searching', description: 'Looking for supporting material on the web', threshold: t })
    t += 6
  }
  stages.push({
    name: isRegenerating ? 'Rewriting' : 'Writing',
    description: isRegenerating
      ? 'Applying your feedback to the previous draft'
      : 'Drafting the section from the brief and retrieved context',
    threshold: t,
  })
  return stages
}

function renderDraftPipeline(heading, stages, elapsedSeconds) {
  const currentIdx = stages.reduce((idx, stage, i) => (elapsedSeconds >= stage.threshold ? i : idx), 0)
  return (
    <div className="section-card__pipeline">
      <h3 className="section-card__pipeline-heading">{heading}</h3>
      <ol className="section-card__pipeline-list">
        {stages.map((stage, i) => {
          const state = i < currentIdx ? 'past' : i === currentIdx ? 'current' : 'upcoming'
          return (
            <li key={stage.name} className={`section-card__pipeline-row is-${state}`}>
              <span className="section-card__pipeline-index">{pad(i + 1)}</span>
              <div className="section-card__pipeline-body">
                <span className="section-card__pipeline-name">{stage.name}</span>
                <span className="section-card__pipeline-desc">{stage.description}</span>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="section-card__pipeline-footer">
        <span className="section-card__pipeline-elapsed">{formatElapsed(elapsedSeconds)} elapsed</span>
        <span className="section-card__pipeline-note">Timings are estimates</span>
      </div>
    </div>
  )
}

function renderInline(text, keyPrefix) {
  // Splits on **bold** and *italic* and returns React nodes.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

function renderMarkdown(content) {
  return content.split('\n\n').filter(b => b.trim()).map((block, i) => {
    const trimmed = block.trim()
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/s)
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6)
      const Tag = `h${level}`
      return <Tag key={i} className="section-card__subheading">
        {renderInline(heading[2], i)}
      </Tag>
    }
    if (/^[-*]\s+/m.test(trimmed) && trimmed.split('\n').every(l => /^[-*]\s+/.test(l.trim()))) {
      return <ul key={i} className="section-card__list">
        {trimmed.split('\n').map((line, j) =>
          <li key={j}>{renderInline(line.trim().replace(/^[-*]\s+/, ''), `${i}-${j}`)}</li>
        )}
      </ul>
    }
    return <p key={i}>{renderInline(trimmed, i)}</p>
  })
}
