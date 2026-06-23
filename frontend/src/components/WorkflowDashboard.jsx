import { useEffect, useState, useRef } from 'react'
import { getStatus } from '../services/api'

const STATUS_BADGE = {
  done: { cls: 'done', text: '✓ Done' },
  running: { cls: 'running', text: '◐ Running' },
  pending: { cls: 'pending', text: 'Pending' },
  awaiting_approval: { cls: 'awaiting', text: '⏸ Needs approval' },
}

const DOT_COLOR = {
  done: '#1d9e75',
  running: '#185fa5',
  pending: '#aeb6c0',
  awaiting_approval: '#c78a2a',
}

export default function WorkflowDashboard({ sessionId, onReviewReady }) {
  const [status, setStatus] = useState(null)
  const notified = useRef(false)

  useEffect(() => {
    let active = true
    // Polling — har 800ms me status check (mock me simulate hota hai)
    const poll = async () => {
      try {
        const s = await getStatus(sessionId)
        if (!active) return
        setStatus(s)
        if (s.review_ready && !notified.current) {
          notified.current = true
          onReviewReady()
        }
      } catch (e) {
        console.error('status error', e)
      }
    }
    poll()
    const id = setInterval(poll, 800)
    return () => { active = false; clearInterval(id) }
  }, [sessionId, onReviewReady])

  if (!status) {
    return <div className="empty"><span className="spin">⏳</span> Starting workflow…</div>
  }

  return (
    <>
      <div className="panel-head">
        <h2>Workflow progress</h2>
        <span className="step">Step {status.current_step} of {status.agents.length}</span>
      </div>
      <div className="agent-list">
        {status.agents.map((a) => {
          const badge = STATUS_BADGE[a.status] || STATUS_BADGE.pending
          return (
            <div key={a.name} className={`agent ${a.status === 'running' ? 'running' : ''} ${a.status === 'pending' ? 'pending' : ''}`}>
              <span className="ico" style={{ color: DOT_COLOR[a.status] }}>●</span>
              <div className="meta">
                <div className="name">{a.label}</div>
                <div className="detail">{a.detail}</div>
              </div>
              <span className={`badge ${badge.cls}`}>{badge.text}</span>
            </div>
          )
        })}
      </div>

      <div className="workflow-info">
        <div className="winfo-card">
          <div className="winfo-icon">🌐</div>
          <div className="winfo-title">Web Search</div>
          <div className="winfo-desc">DuckDuckGo searching for relevant sources in real-time</div>
        </div>
        <div className="winfo-card">
          <div className="winfo-icon">🧠</div>
          <div className="winfo-title">LangChain LCEL</div>
          <div className="winfo-desc">Prompt → ChatOpenAI → Parser chain processing your query</div>
        </div>
        <div className="winfo-card">
          <div className="winfo-icon">📊</div>
          <div className="winfo-title">GPT-4o-mini</div>
          <div className="winfo-desc">Synthesizing information into a structured research report</div>
        </div>
        <div className="winfo-card">
          <div className="winfo-icon">⏱️</div>
          <div className="winfo-title">Est. 30–60s</div>
          <div className="winfo-desc">Web search + PDF processing + LLM synthesis takes time</div>
        </div>
      </div>

      <div className="workflow-tip">
        <span className="wtip-icon">💡</span>
        <div>
          <strong>What's happening?</strong> The Researcher agent is collecting
          information from the web and your uploaded PDFs. Once all 3 agents
          complete, you'll review the findings before the final report is generated.
        </div>
      </div>
    </>
  )
}
