import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import { describeError } from '../lib/errors'
import './SourcesScreen.css'

const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx,.xlsx,.json,.csv,.tsv'

/**
 * Attach source material to a project.
 *
 * Sources are fetched from the API on mount rather than held only in React
 * state, so returning to this screen — or reloading the page — shows what was
 * already uploaded instead of an empty list.
 */
export default function SourcesScreen({ project, onContinue }) {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState('')
  const [errorAction, setErrorAction] = useState(null) // 'list' | 'url' | null
  const [urlRetryValue, setUrlRetryValue] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)
  const pollTimers = useRef(new Map())

  const loadSources = useCallback(async (isRetry = false) => {
    if (isRetry) setRetrying(true)
    try {
      const list = await api.listSources(project.id)
      setSources(list)
      // Anything still mid-ingestion when we left the screen keeps polling.
      list.filter(s => s.status === 'pending').forEach(s => pollSourceStatus(s.id))
      setError('')
      setErrorAction(null)
    } catch (err) {
      setError(describeError(err, 'Could not load your existing sources.'))
      setErrorAction('list')
    } finally {
      setLoading(false)
      setRetrying(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  useEffect(() => {
    loadSources()
    const timers = pollTimers.current
    return () => {
      timers.forEach(clearInterval)
      timers.clear()
    }
  }, [project.id, loadSources])

  const pollSourceStatus = useCallback((sourceId) => {
    if (pollTimers.current.has(sourceId)) return

    const interval = setInterval(async () => {
      try {
        const updated = await api.getSourceStatus(project.id, sourceId)
        setSources(prev => prev.map(s => (s.id === sourceId ? updated : s)))
        if (updated.status === 'ingested' || updated.status === 'failed') {
          clearInterval(interval)
          pollTimers.current.delete(sourceId)
        }
      } catch {
        clearInterval(interval)
        pollTimers.current.delete(sourceId)
      }
    }, 1500)

    pollTimers.current.set(sourceId, interval)
  }, [project.id])

  async function uploadOne(file, existingId) {
    const id = existingId || `temp-${Date.now()}-${file.name}`
    if (existingId) {
      setSources(prev => prev.map(s => (s.id === id ? { ...s, retrying: true } : s)))
    } else {
      setSources(prev => [...prev, { id, name: file.name, status: 'uploading', kind: guessKind(file.name), file }])
    }
    try {
      const saved = await api.uploadSource(project.id, file)
      setSources(prev => prev.map(s => (s.id === id ? saved : s)))
      pollSourceStatus(saved.id)
    } catch (err) {
      const detail = describeError(err, 'Upload failed')
      setSources(prev => prev.map(s => (s.id === id ? { ...s, status: 'failed', error: detail, file, retrying: false } : s)))
    }
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList)
    for (const file of files) {
      await uploadOne(file)
    }
  }

  function retryUpload(source) {
    if (source.file) uploadOne(source.file, source.id)
  }

  async function submitUrl(url) {
    try {
      const saved = await api.addUrlSource(project.id, url)
      setSources(prev => [...prev, saved])
      pollSourceStatus(saved.id)
      setError('')
      setErrorAction(null)
    } catch (err) {
      setError(describeError(err, 'Could not add that link'))
      setErrorAction('url')
      setUrlRetryValue(url)
    } finally {
      setRetrying(false)
    }
  }

  async function handleAddUrl(e) {
    e.preventDefault()
    const url = urlInput.trim()
    if (!url) return
    setUrlInput('')
    setError('')
    await submitUrl(url)
  }

  function handleRetryError() {
    if (errorAction === 'list') {
      loadSources(true)
    } else if (errorAction === 'url') {
      setRetrying(true)
      submitUrl(urlRetryValue)
    }
  }

  function removeSource(sourceId) {
    setSources(prev => prev.filter(s => s.id !== sourceId))
    const timer = pollTimers.current.get(sourceId)
    if (timer) { clearInterval(timer); pollTimers.current.delete(sourceId) }
    api.deleteSource(project.id, sourceId).catch(() => {})
  }

  const readyCount = sources.filter(s => s.status === 'ingested').length
  const busyCount = sources.filter(s => s.status === 'pending' || s.status === 'uploading').length

  return (
    <div className="sources">
      <header className="sources-header">
        <span className="sources-eyebrow">Step one</span>
        <h1>Add your source material</h1>
        <p>
          Optional, but it makes every section more accurate. Upload PDFs, photos of handwritten
          notes, spreadsheets, or paste links — they are read, indexed, and cited while drafting.
        </p>
      </header>

      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      >
        <span className="dropzone__icon">＋</span>
        <span className="dropzone__label">Drop files here, or click to browse</span>
        <span className="dropzone__hint">PDF · DOCX · XLSX · JSON/CSV · PNG/JPG · TXT/MD</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      <form className="url-row" onSubmit={handleAddUrl}>
        <input
          type="url"
          placeholder="https://example.com/article-to-reference"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
        />
        <button type="submit" className="btn btn--ghost" disabled={!urlInput.trim()}>Add link</button>
      </form>

      {error && (
        <div className="sources-error-row">
          <p className="sources-error">{error}</p>
          <button type="button" className="btn btn--ghost" onClick={handleRetryError} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      {loading && <p className="sources-empty">Loading your sources…</p>}

      {!loading && sources.length === 0 && (
        <p className="sources-empty">
          No sources attached. You can still continue — the agents will research the topic from the
          web on their own.
        </p>
      )}

      {sources.length > 0 && (
        <>
          <div className="sources-count">
            <span>{sources.length} attached</span>
            {readyCount > 0 && <span className="is-ready">{readyCount} indexed</span>}
            {busyCount > 0 && <span className="is-busy">{busyCount} still reading</span>}
          </div>

          <div className="sources-group">
            <h2 className="sources-group__heading">Attached sources</h2>
            <ul className="source-list">
              {sources.map((s, i) => (
                <li key={s.id} className={`source-item source-item--${s.status}`}>
                  <span className="source-item__index">{pad(i + 1)}</span>
                  <span className="source-item__kind">{kindLabel(s.kind)}</span>
                  <span className="source-item__name" title={s.name}>{s.name}</span>
                  <span className="source-item__status">{statusLabel(s)}</span>
                  {s.status === 'failed' && (
                    <button
                      type="button"
                      className="source-item__retry"
                      onClick={() => retryUpload(s)}
                      disabled={s.retrying}
                    >
                      {s.retrying ? 'Retrying…' : 'Try again'}
                    </button>
                  )}
                  <button
                    className="source-item__remove"
                    onClick={() => removeSource(s.id)}
                    aria-label={`Remove ${s.name}`}
                  >×</button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="sources-actions">
        <button className="btn btn--primary" onClick={onContinue} disabled={busyCount > 0}>
          {busyCount > 0 ? 'Waiting for sources to finish…' : 'Continue to outline →'}
        </button>
      </div>
    </div>
  )
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function guessKind(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'json') return 'json'
  if (['csv', 'tsv'].includes(ext)) return 'csv'
  return 'text'
}

function kindLabel(kind) {
  return {
    pdf: 'PDF', image: 'IMG', text: 'TXT', docx: 'DOC',
    xlsx: 'XLS', json: 'JSON', csv: 'CSV', url: 'URL',
  }[kind] || (kind || '').toUpperCase()
}

function statusLabel(s) {
  if (s.retrying) return 'retrying…'
  if (s.status === 'uploading') return 'uploading…'
  if (s.status === 'pending') return 'reading…'
  if (s.status === 'ingested') return s.chunk_count ? `${s.chunk_count} chunks` : 'ready'
  if (s.status === 'failed') return s.error ? `failed — ${truncate(s.error, 44)}` : 'failed'
  return s.status
}

function truncate(str, n) {
  return str.length > n ? `${str.slice(0, n - 1)}…` : str
}
