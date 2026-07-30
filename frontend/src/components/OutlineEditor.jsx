import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import api from '../api/client'
import { describeError } from '../lib/errors'
import { rememberProject } from '../lib/storage'
import './OutlineEditor.css'

const PIPELINE_STAGES = [
  { name: 'Researcher', threshold: 0, description: 'Validating the topic, searching the web, and retrieving passages from your sources' },
  { name: 'Summariser', threshold: 14, description: 'Condensing the retrieved evidence into a writer-ready brief' },
  { name: 'Critic', threshold: 26, description: 'Checking claims for gaps, contradictions, and weak support' },
  { name: 'Outline', threshold: 36, description: 'Proposing a section structure for your report' },
]

export default function OutlineEditor({ project, onOutlineApproved, onBack }) {
  const [sections, setSections] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkpoint, setCheckpoint] = useState(null)
  const [briefExpanded, setBriefExpanded] = useState(false)
  const [briefOverflows, setBriefOverflows] = useState(false)
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [errorAction, setErrorAction] = useState(null) // 'regenerate' | 'approve' | null
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false)
  const briefRef = useRef(null)

  useLayoutEffect(() => {
    if (briefRef.current) {
      setBriefOverflows(briefRef.current.scrollHeight > briefRef.current.clientHeight + 1)
    }
  }, [checkpoint?.research_brief])

  useEffect(() => {
    loadOutline()
  }, [])

  useEffect(() => {
    if (!loading) return undefined
    setElapsed(0)
    const timer = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [loading])

  async function loadOutline() {
    setLoading(true)
    setError('')
    try {
      const res = await api.generateOutline(project.id)
      setSections(res.sections)
      setCheckpoint(res.checkpoint || null)
    } catch (err) {
      setError(describeError(err, 'Could not generate outline'))
      setErrorAction('regenerate')
      // The backend only responds 422 from this endpoint when the research
      // checkpoint's validation_status is "rejected" (see
      // backend/app/api/projects.py:propose_outline) — it commits that
      // status to the project before raising, but doesn't return the
      // checkpoint body on failure, so the status code is the signal here.
      if (err?.response?.status === 422) {
        rememberProject(project.id, { stage: 'rejected' })
      }
    } finally {
      setLoading(false)
    }
  }

  function handleRegenerateOutline() {
    setConfirmingRegenerate(false)
    loadOutline()
  }

  function handleRetryError() {
    if (errorAction === 'approve') handleApprove()
    else if (errorAction === 'regenerate') loadOutline()
  }

  function updateSection(index, field, value) {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  function removeSection(index) {
    setSections(prev => prev.filter((_, i) => i !== index))
  }

  function moveSection(index, direction) {
    setSections(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function addSection() {
    setSections(prev => [...prev, { title: 'New Section', word_target: 300, notes: '' }])
  }

  async function handleApprove() {
    if (!sections || sections.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const saved = await api.approveOutline(project.id, sections)
      onOutlineApproved(saved)
    } catch (err) {
      setError(describeError(err, 'Could not save outline'))
      setErrorAction('approve')
      setSubmitting(false)
    }
  }

  if (loading) {
    const currentIdx = PIPELINE_STAGES.reduce(
      (idx, stage, i) => (elapsed >= stage.threshold ? i : idx),
      0
    )
    return (
      <div className="outline-screen">
        <div className="outline-pipeline">
          <h2 className="outline-pipeline__heading">Preparing your report</h2>
          <ol className="outline-pipeline__list">
            {PIPELINE_STAGES.map((stage, i) => {
              const state = i < currentIdx ? 'past' : i === currentIdx ? 'current' : 'upcoming'
              return (
                <li key={stage.name} className={`outline-pipeline__row is-${state}`}>
                  <span className="outline-pipeline__index">{pad(i + 1)}</span>
                  <div className="outline-pipeline__body">
                    <span className="outline-pipeline__name">{stage.name}</span>
                    <span className="outline-pipeline__desc">{stage.description}</span>
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="outline-pipeline__footer">
            <span className="outline-pipeline__elapsed">{formatElapsed(elapsed)} elapsed</span>
            <span className="outline-pipeline__note">Timings are estimates — a typical run takes 30 to 60 seconds</span>
          </div>
        </div>
      </div>
    )
  }

  if (error && !sections) {
    return (
      <div className="outline-screen">
        <div className="outline-loading">
          <p className="outline-error">{error}</p>
          <button className="btn btn--ghost" onClick={loadOutline}>Try again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="outline-screen">
      <div className="outline-header">
        {onBack && (
          <button className="outline-back" onClick={onBack}>← Back to sources</button>
        )}
        <span className="outline-header__eyebrow">Step two</span>
        <h1>Here's a proposed outline for "{project.topic}"</h1>
        <p>Edit titles, reorder, remove sections you don't need, or add your own. The agents have not written the paper yet — this is the human checkpoint before drafting.</p>
      </div>

      {checkpoint && (
        <section className="checkpoint">
          <h2 className="checkpoint__heading">Research checkpoint</h2>

          <p className={`checkpoint__status checkpoint__status--${checkpoint.validation_status}`}>
            {checkpoint.validation_message}
          </p>

          {checkpoint.research_brief && (
            <div className="checkpoint__block">
              <span className="checkpoint__label">Research brief</span>
              <div ref={briefRef} className={`checkpoint__brief ${briefExpanded ? 'checkpoint__brief--expanded' : ''}`}>
                <p className="checkpoint__brief-text">{flattenBrief(checkpoint.research_brief)}</p>
              </div>
              {briefOverflows && (
                <button
                  type="button"
                  className="checkpoint__toggle"
                  onClick={() => setBriefExpanded(v => !v)}
                >
                  {briefExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          {checkpoint.critic_report && (
            <div className="checkpoint__block">
              <span className="checkpoint__label">Critic Agent report</span>
              <p className="checkpoint__prose">{checkpoint.critic_report}</p>
            </div>
          )}
          {checkpoint.sources?.length > 0 && (
            <div className="checkpoint__block">
              <span className="checkpoint__label">Evidence found</span>
              <button
                type="button"
                className="checkpoint__toggle"
                onClick={() => setSourcesExpanded(v => !v)}
              >
                {sourcesExpanded ? 'Hide' : 'Show'} {checkpoint.sources.length} source excerpts
              </button>
              {sourcesExpanded && (
                <ul className="checkpoint__sources">
                  {checkpoint.sources.map((s, i) => (
                    <li key={i}>
                      <div className="checkpoint__source-line">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer">{s.source_name}</a>
                        ) : (
                          <span>{s.source_name}</span>
                        )}
                        {s.kind && <span className="checkpoint__source-kind">{s.kind}</span>}
                        {s.retrieval_method && <span className="checkpoint__source-tag">{s.retrieval_method}</span>}
                      </div>
                      {s.excerpt && <p className="checkpoint__source-excerpt">{s.excerpt}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <div className="outline-list">
        {sections.map((sec, i) => (
          <div className="outline-row" key={i}>
            <span className="outline-row__index">{pad(i + 1)}</span>
            <div className="outline-row__order">
              <button onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} aria-label="Move down">↓</button>
            </div>
            <div className="outline-row__main">
              <input
                className="outline-row__title"
                value={sec.title}
                onChange={e => updateSection(i, 'title', e.target.value)}
              />
              <textarea
                className="outline-row__notes"
                value={sec.notes}
                onChange={e => updateSection(i, 'notes', e.target.value)}
                placeholder="What should this section cover?"
                rows={2}
              />
            </div>
            <div className="outline-row__meta">
              <label>
                <span>words</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={sec.word_target}
                  onChange={e => updateSection(i, 'word_target', parseInt(e.target.value) || 0)}
                />
              </label>
              <button className="outline-row__remove" onClick={() => removeSection(i)} aria-label="Remove section">Remove</button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn--ghost outline-add" onClick={addSection}>+ Add a section</button>

      {error && (
        <div className="outline-error-row">
          <p className="outline-error-msg">{error}</p>
          <button type="button" className="btn btn--ghost" onClick={handleRetryError} disabled={submitting}>
            {submitting ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      <div className="outline-actions">
        {!confirmingRegenerate ? (
          <button className="btn btn--ghost" onClick={() => setConfirmingRegenerate(true)} disabled={submitting}>
            Propose a different outline
          </button>
        ) : (
          <div className="outline-regenerate-confirm">
            <span className="outline-regenerate-confirm__text">This will replace your edits.</span>
            <button className="btn btn--ghost" onClick={() => setConfirmingRegenerate(false)}>Cancel</button>
            <button className="btn btn--primary" onClick={handleRegenerateOutline}>Regenerate</button>
          </div>
        )}
        <button className="btn btn--primary" onClick={handleApprove} disabled={submitting || sections.length === 0}>
          {submitting ? 'Saving…' : 'Approve outline & start drafting →'}
        </button>
      </div>
    </div>
  )
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
 * Old projects may still have a raw JSON dump stored as the research brief
 * (see backend/app/agents/summarizer/agent.py). Detect that case and flatten
 * it into readable prose instead of showing the literal JSON.
 */
function flattenBrief(raw) {
  if (typeof raw !== 'string') return raw

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'research_brief' in parsed) {
    parsed = parsed.research_brief
  }

  return flattenBriefValue(parsed)
}

function flattenBriefValue(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(flattenBriefValue).join('\n\n')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => `${titleCaseKey(key)}: ${stringifyBriefValue(val)}`)
      .join('\n\n')
  }
  return String(value)
}

function stringifyBriefValue(value) {
  if (Array.isArray(value)) return value.map(stringifyBriefValue).join(', ')
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => `${titleCaseKey(key)} — ${stringifyBriefValue(val)}`)
      .join(' ')
  }
  return String(value)
}

function titleCaseKey(key) {
  return key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
