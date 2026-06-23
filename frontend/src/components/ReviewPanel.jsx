import { useEffect, useState } from 'react'
import { getFindings, submitReview } from '../services/api'

export default function ReviewPanel({ sessionId, onApproved }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let active = true
    getFindings(sessionId).then((d) => { if (active) setData(d) }).catch(console.error)
    return () => { active = false }
  }, [sessionId])

  const act = async (action) => {
    setBusy(true)
    setMsg('')
    try {
      await submitReview(sessionId, action)
      if (action === 'approve') {
        onApproved()
      } else if (action === 'request_changes') {
        setMsg('Changes requested — agents would re-run this step.')
      } else {
        setMsg('Findings rejected — research stopped.')
      }
    } catch (e) {
      setMsg('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="empty"><span className="spin">⏳</span> Loading findings…</div>

  return (
    <>
      <div className="panel-head">
        <h2>Review findings</h2>
        <span className="step">Your approval needed</span>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">Sources reviewed</div><div className="value">{data.sources_count}</div></div>
        <div className="stat"><div className="label">Key findings</div><div className="value">{data.key_points}</div></div>
        <div className="stat"><div className="label">Flagged claims</div><div className="value warn">{data.flagged}</div></div>
      </div>

      <div>
        {data.findings.map((f) => (
          <div key={f.id} className={`finding ${f.status === 'flagged' ? 'flagged' : ''}`}>
            <span className="f-ico">{f.status === 'flagged' ? '⚠️' : '✅'}</span>
            <div className="f-text">
              {f.text}
              <div className="f-src">
                {f.status === 'flagged' ? `${f.reason} · ` : 'Verified · '}
                {f.sources.join(', ')}
              </div>
            </div>
            <span className={`badge ${f.status === 'flagged' ? 'awaiting' : 'done'}`}>
              {f.status === 'flagged' ? 'Flagged' : 'Verified'}
            </span>
          </div>
        ))}
      </div>

      <div className="review-sources">
        <div className="rsources-title">🔗 Sources used</div>
        <div className="rsources-list">
          {[...new Set(data.findings.flatMap(f => f.sources || []))].map((src, i) => (
            <div key={i} className="rsource-chip">
              {src.startsWith('http')
                ? <><span>🌐</span> <a href={src} target="_blank" rel="noreferrer"
                    style={{color:'rgba(0,200,255,0.7)', textDecoration:'none', fontSize:12,
                    wordBreak:'break-all'}}>{src}</a></>
                : <><span>📄</span> <span style={{fontSize:12, color:'rgba(255,255,255,0.5)'}}>{src}</span></>
              }
            </div>
          ))}
        </div>
      </div>

      <div className="review-note">
        <span>ℹ️</span>
        <div>
          <strong>Your role:</strong> Review the findings above carefully.
          Approve to generate the final report, request changes if something
          needs improvement, or reject to stop the process.
        </div>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => act('approve')}>✓ Approve &amp; generate report</button>
        <button className="btn" disabled={busy} onClick={() => act('request_changes')}>✎ Request changes</button>
        <button className="btn danger" disabled={busy} onClick={() => act('reject')}>✕ Reject</button>
      </div>
      {msg && <p style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 12 }}>{msg}</p>}
    </>
  )
}
