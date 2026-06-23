import { useRef, useState } from 'react'

// Sidebar — query input, file upload, web search toggle, start button
export default function Sidebar({ query, setQuery, onStart, started, loading, onFilesChange }) {
  const [files, setFiles] = useState([])
  const fileInputRef = useRef(null)

  const handleFiles = (e) => {
    const selected = Array.from(e.target.files)
    setFiles(selected)
    if (onFilesChange) onFilesChange(selected)
  }

  const removeFile = (index) => {
    const updated = files.filter((_, i) => i !== index)
    setFiles(updated)
    if (onFilesChange) onFilesChange(updated)
  }

  return (
    <aside className="sidebar">
      <div>
        <label className="field-label" htmlFor="query">Research query</label>
        {started ? (
          <div className="chip" style={{ alignItems: 'flex-start', lineHeight: 1.5 }}>{query}</div>
        ) : (
          <textarea
            id="query"
            className="query"
            placeholder="e.g. Impact of climate change on ocean biodiversity..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>

      <div>
        <label className="field-label">Sources</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((f, i) => (
            <div key={i} className="chip" style={{ justifyContent: 'space-between' }}>
              <span>📄 {f.name}</span>
              {!started && (
                <span
                  onClick={() => removeFile(i)}
                  style={{ cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, lineHeight: 1 }}
                >×</span>
              )}
            </div>
          ))}

          {!started && (
            <>
              <div
                className="chip dashed"
                style={{ cursor: 'pointer' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <span>＋</span> Upload PDF / TXT
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                multiple
                style={{ display: 'none' }}
                onChange={handleFiles}
              />
            </>
          )}
        </div>
      </div>

      <div className="toggle-row">
        <input type="checkbox" defaultChecked readOnly /> Web search enabled
      </div>

      {!started && (
        <button
          className="btn primary block"
          onClick={() => onStart(files)}
          disabled={loading || !query.trim()}
        >
          {loading ? <span className="spin">⏳</span> : '▶'} Start research
        </button>
      )}
    </aside>
  )
}
