import { useState, useEffect } from 'react'
import api from '../api/client'
import { describeError } from '../lib/errors'
import { getRecentProjects, forgetProject, rememberProject } from '../lib/storage'
import { COMMON_WORDS } from '../lib/commonWords'
import './HomeScreen.css'

const STAGE_LABEL = {
  sources: 'Adding sources',
  outline: 'Reviewing outline',
  draft: 'Drafting sections',
  rejected: 'Topic rejected',
}

const GIBBERISH_MESSAGE = "This doesn't look like a specific research topic yet."

/**
 * Fast client-side pre-check so obviously-bad input is caught before the
 * user burns two screens on it — and before api.createProject is ever
 * called. The backend's LLM-based validation still runs after project
 * creation; this is just an instant pre-check, not a replacement for it.
 *
 * Letter-pattern heuristics (vowel ratio, consonant runs) can't reliably
 * tell word-shaped noise ("kahca", "jacda") from real words, since random
 * strings can land on plausible vowel positions by chance. A dictionary
 * match is a much stronger signal — see src/lib/commonWords.js.
 */
function isGibberishTopic(text) {
  const trimmed = text.trim()
  if (trimmed.length < 6) return true

  const alphaRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length
  if (alphaRatio < 0.45) return true

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  const tinyWordRatio = tokens.filter(w => w.length <= 2).length / tokens.length
  if (tinyWordRatio > 0.65) return true

  // Only check tokens that are plain lowercase words — this deliberately
  // skips proper nouns, acronyms, and technical terms (LangGraph, RAG,
  // ChromaDB, GPT-4o) rather than penalising them, since those are
  // legitimate in a research topic and won't be in a common-word list.
  const checkable = tokens
    .map(w => w.replace(/[^a-zA-Z]/g, ''))
    .filter(w => w.length >= 3 && w === w.toLowerCase() && /^[a-z]+$/.test(w))

  if (checkable.length >= 2) {
    const matched = checkable.filter(w => COMMON_WORDS.has(w)).length
    const matchRatio = matched / checkable.length
    if (matchRatio < 0.35) return true
  }

  return false
}

function validateTopic(rawTopic) {
  return isGibberishTopic(rawTopic) ? GIBBERISH_MESSAGE : ''
}

const HOW_IT_WORKS = [
  'Describe your topic — add context and any constraints you already know',
  'Attach source material — PDFs, notes, spreadsheets, scans, or links',
  'Review the outline — the agents propose a structure; you decide it',
  'Approve each section — nothing enters the report without your sign-off',
]

const AGENTS = [
  { name: 'Researcher', desc: 'Validates the topic, searches the web, and retrieves matching passages from your uploaded sources' },
  { name: 'Summariser', desc: 'Strips the noise and turns the retrieved evidence into a writer-ready brief' },
  { name: 'Critic', desc: 'Flags unsupported claims, contradictions, and gaps before any drafting begins' },
  { name: 'Writer', desc: 'Drafts one section at a time from the brief, the critic report, and your sources' },
]

/**
 * Landing screen. Two jobs: start a new report, or pick up an existing one.
 *
 * The recent list comes from localStorage (the API has no list endpoint), so
 * every entry is verified against the backend on mount. Only a genuine 404
 * means the project was deleted server-side and should be forgotten — any
 * other failure (network down, timeout, 5xx) just means verification didn't
 * happen, so the entry stays and is flagged unverified instead of erased.
 */
export default function HomeScreen({ onOpenProject, onProjectCreated }) {
  const [topic, setTopic] = useState('')
  const [context, setContext] = useState('')
  const [creating, setCreating] = useState(false)
  const [retryingCreate, setRetryingCreate] = useState(false)
  const [error, setError] = useState('')
  const [topicError, setTopicError] = useState('')
  const [recent, setRecent] = useState([])
  const [verifying, setVerifying] = useState(true)
  const [retryingVerify, setRetryingVerify] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)

  useEffect(() => {
    verifyRecent()
  }, [])

  async function verifyRecent(isRetry = false) {
    const stored = getRecentProjects()
    if (stored.length === 0) {
      setRecent([])
      setVerifying(false)
      setRetryingVerify(false)
      return
    }

    if (isRetry) setRetryingVerify(true)
    else setVerifying(true)

    const checked = await Promise.all(
      stored.map(async entry => {
        try {
          const live = await api.getProject(entry.id)
          return { ...entry, topic: live.topic, status: live.status, unverified: false }
        } catch (err) {
          if (err?.response?.status === 404) {
            // The project really is gone server-side; drop it from the list.
            forgetProject(entry.id)
            return null
          }
          // Server unreachable or erroring — keep the stored entry, just mark
          // it unverified rather than pretending it doesn't exist.
          return { ...entry, unverified: true }
        }
      })
    )

    setRecent(checked.filter(Boolean))
    setVerifying(false)
    setRetryingVerify(false)
  }

  function handleCreate(e) {
    e.preventDefault()
    submitCreate()
  }

  async function submitCreate(isRetry = false) {
    if (!topic.trim()) return
    const validationMessage = validateTopic(topic)
    if (validationMessage) {
      setTopicError(validationMessage)
      return
    }
    setTopicError('')
    if (isRetry) setRetryingCreate(true)
    else setCreating(true)
    setError('')
    try {
      const project = await api.createProject(topic.trim(), context.trim())
      rememberProject(project.id, { topic: project.topic, stage: 'sources' })
      onProjectCreated(project)
    } catch (err) {
      setError(describeError(err, 'Could not create the report.'))
    } finally {
      setCreating(false)
      setRetryingCreate(false)
    }
  }

  function handleDeleteClick(e, id) {
    e.stopPropagation()
    setConfirmingId(id)
  }

  function handleCancelDelete(e) {
    e.stopPropagation()
    setConfirmingId(null)
  }

  async function handleConfirmDelete(e, id) {
    e.stopPropagation()
    setConfirmingId(null)
    setRecent(prev => prev.filter(p => p.id !== id))
    forgetProject(id)
    try {
      await api.deleteProject(id)
    } catch {
      // Already gone server-side — the local list is what mattered.
    }
  }

  function handleOpen(p) {
    setConfirmingId(null)
    onOpenProject(p)
  }

  return (
    <div className="home">
      <div className="home-grid">
        <form className="home-form" onSubmit={handleCreate}>
          <span className="home-eyebrow">New report</span>
          <h1 className="home-title">What are you researching?</h1>
          <p className="home-intro">
            Give your topic and context, and four agents will research, check, and draft it for your review.
          </p>

          <div className="home-rule" />

          <label className="home-field">
            <span className="home-field__label">Topic</span>
            <textarea
              className="home-field__input home-field__input--topic"
              value={topic}
              onChange={e => {
                setTopic(e.target.value)
                if (topicError) setTopicError('')
              }}
              placeholder="Multi-agent research and synthesis assistant using LangGraph"
              rows={2}
              autoFocus
            />
          </label>
          {topicError && <p className="home-field__error">{topicError}</p>}

          <label className="home-field">
            <span className="home-field__label">Context and problem statement</span>
            <textarea
              className="home-field__input"
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="What problem does this address, what constraints matter, what have you already decided?"
              rows={5}
            />
          </label>

          {error && (
            <div className="home-error-row">
              <p className="home-error">{error}</p>
              <button type="button" className="btn btn--ghost" onClick={() => submitCreate(true)} disabled={retryingCreate}>
                {retryingCreate ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          )}

          <button type="submit" className="btn btn--primary" disabled={creating || retryingCreate || !topic.trim()}>
            {creating ? 'Setting up…' : 'Start this report'}
          </button>
        </form>

        <div className="home-column">
          <section className="home-list">
            <h2 className="home-list__heading">Your reports</h2>

            {verifying && <p className="home-list__empty">Checking your saved reports…</p>}

            {!verifying && recent.length === 0 && (
              <p className="home-list__empty">
                Nothing here yet. Start a report on the left and it will appear here so you can come
                back to it later.
              </p>
            )}

            {!verifying && recent.some(p => p.unverified) && (
              <div className="home-list__banner">
                <p className="home-list__banner-text">Could not reach the server, so these may be out of date.</p>
                <button type="button" className="btn btn--ghost" onClick={() => verifyRecent(true)} disabled={retryingVerify}>
                  {retryingVerify ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            )}

            {!verifying && recent.length > 0 && (
              <ul className="home-rows">
                {recent.map((p, i) => (
                  <li className="home-row" key={p.id}>
                    <button className="home-row__button" onClick={() => handleOpen(p)}>
                      <span className="home-row__index">{pad(i + 1)}</span>
                      <span className="home-row__body">
                        <span className="home-row__title">{p.topic || 'Untitled report'}</span>
                        {confirmingId === p.id ? (
                          <span className="home-row__confirm">
                            <span className="home-row__confirm-text">Delete this report permanently?</span>
                            <span className="home-row__confirm-actions">
                              <span
                                className="home-row__confirm-btn home-row__confirm-btn--delete"
                                role="button"
                                tabIndex={0}
                                onClick={e => handleConfirmDelete(e, p.id)}
                                onKeyDown={e => e.key === 'Enter' && handleConfirmDelete(e, p.id)}
                              >Delete</span>
                              <span
                                className="home-row__confirm-btn"
                                role="button"
                                tabIndex={0}
                                onClick={handleCancelDelete}
                                onKeyDown={e => e.key === 'Enter' && handleCancelDelete(e)}
                              >Cancel</span>
                            </span>
                          </span>
                        ) : (
                          <span className="home-row__meta">
                            {p.unverified ? (
                              <span className="home-row__unverified">Not verified — server unreachable</span>
                            ) : (
                              <>
                                <span className={`stage-${p.stage === 'rejected' ? 'rejected' : p.status === 'completed' ? 'done' : 'active'}`}>
                                  {p.stage === 'rejected' ? STAGE_LABEL.rejected : p.status === 'completed' ? 'Complete' : STAGE_LABEL[p.stage] || 'In progress'}
                                </span>
                                {p.sectionCount != null && <span>{p.sectionCount} sections</span>}
                              </>
                            )}
                            <span>{formatWhen(p.lastOpenedAt)}</span>
                          </span>
                        )}
                      </span>
                      <span
                        className="home-row__delete"
                        role="button"
                        tabIndex={0}
                        aria-label="Delete this report"
                        onClick={e => handleDeleteClick(e, p.id)}
                        onKeyDown={e => e.key === 'Enter' && handleDeleteClick(e, p.id)}
                      >×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="home-list">
            <h2 className="home-list__heading">How this works</h2>
            <ol className="home-rows">
              {HOW_IT_WORKS.map((step, i) => (
                <li className="home-row home-row--static" key={i}>
                  <span className="home-row__index">{pad(i + 1)}</span>
                  <span className="home-row__body">
                    <span className="home-row__text">{step}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <section className="home-agents">
        <h2 className="home-agents__heading">The four agents</h2>
        <div className="home-agents__grid">
          {AGENTS.map((a, i) => (
            <div className="home-agents__entry" key={a.name}>
              <span className="home-agents__index">{pad(i + 1)}</span>
              <span className="home-agents__name">{a.name}</span>
              <p className="home-agents__desc">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatWhen(iso) {
  if (!iso) return ''
  const then = new Date(iso)
  const mins = Math.round((Date.now() - then.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString()
}
