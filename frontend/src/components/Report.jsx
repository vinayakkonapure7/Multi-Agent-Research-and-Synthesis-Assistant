import { useEffect, useState } from 'react'
import { getReport } from '../services/api'

export default function Report({ sessionId, onNewResearch }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getReport(sessionId)
      .then(r => { if (active) setReport(r) })
      .catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [sessionId])

  const download = () => {
    if (!report) return
    // Use raw markdown if available (real backend), otherwise build from sections
    const text = report.raw ||
      report.sections.map(s => `## ${s.heading}\n\n${s.body}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'research_report.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return (
    <div style={{ color: '#8b1a1a', padding: 20 }}>⚠️ {error}</div>
  )

  if (!report) return (
    <div className="empty">
      <span className="spin">⏳</span> Generating report…
    </div>
  )

  return (
    <>
      <div className="panel-head">
        <h2>Final report</h2>
        <button className="ghost-btn" onClick={onNewResearch}>＋ New research</button>
      </div>

      <div className="report-card">
        <h1>{report.title}</h1>
        <div className="sub">{report.generated_at} · with citations</div>

        {report.sections.map((s, i) => (
          <div key={i}>
            <h3>{s.heading}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{s.body}</p>
          </div>
        ))}

        <div className="download-bar">
          <span className="pdf-ico">📄</span>
          <div className="meta">
            <div className="t">research_report.md</div>
            <div className="s">Generated after approval · full markdown</div>
          </div>
          <button className="btn" onClick={download}>⤓ Download</button>
        </div>
      </div>
    </>
  )
}
