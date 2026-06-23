import { useState, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import WorkflowDashboard from './components/WorkflowDashboard'
import ReviewPanel from './components/ReviewPanel'
import Report from './components/Report'
import { startResearch } from './services/api'

// App stages: setup -> running -> review -> report
export default function App() {
  const [stage, setStage] = useState('setup')
  const [query, setQuery] = useState('')
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reviewReady, setReviewReady] = useState(false)
  const [error, setError] = useState('')
  const filesRef = useRef([])

  const handleFilesChange = (files) => { filesRef.current = files }

  const handleStart = async (files = []) => {
    setLoading(true)
    setError('')
    try {
      const s = await startResearch(query, files)
      setSession(s)
      setStage('running')
    } catch (e) {
      setError(`Could not start: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleReviewReady = useCallback(() => setReviewReady(true), [])

  const reset = () => {
    setStage('setup')
    setSession(null)
    setReviewReady(false)
    setError('')
    filesRef.current = []
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">🧠</span> Research Assistant</div>
        {stage !== 'setup' && (
          <button className="ghost-btn" onClick={reset}>＋ New research</button>
        )}
      </header>

      <div className={`layout${stage === 'setup' ? ' layout-full' : ''}`}>
        <Sidebar
          query={query}
          setQuery={setQuery}
          onStart={handleStart}
          started={stage !== 'setup'}
          loading={loading}
          onFilesChange={handleFilesChange}
        />

        <main className="main">
          {error && (
            <div style={{ background: '#fff0f0', border: '1px solid #f5c2c2', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#8b1a1a' }}>
              ⚠️ {error}
            </div>
          )}

          {stage === 'setup' && (
            <div className="landing">
              <div className="landing-left">
                <div className="landing-badge">✦ AI-Powered Research</div>
                <h1 className="landing-title">
                  Research smarter,<br />
                  <span className="landing-accent">not harder</span>
                </h1>
                <p className="landing-sub">
                  Enter a topic, upload your PDFs, and let 4 specialized AI
                  agents collect, summarize, validate, and write a full research
                  report — with your approval at every step.
                </p>

                <div className="landing-steps">
                  <div className="lstep">
                    <div className="lstep-icon">🔍</div>
                    <div className="lstep-num">01</div>
                    <div className="lstep-title">Researcher</div>
                    <div className="lstep-desc">Searches web and processes PDFs</div>
                  </div>
                  <div className="lstep-arrow">→</div>
                  <div className="lstep">
                    <div className="lstep-icon">📝</div>
                    <div className="lstep-num">02</div>
                    <div className="lstep-title">Summariser</div>
                    <div className="lstep-desc">Extracts key insights by theme</div>
                  </div>
                  <div className="lstep-arrow">→</div>
                  <div className="lstep">
                    <div className="lstep-icon">🛡️</div>
                    <div className="lstep-num">03</div>
                    <div className="lstep-title">Critic</div>
                    <div className="lstep-desc">Validates claims, flags conflicts</div>
                  </div>
                  <div className="lstep-arrow">→</div>
                  <div className="lstep">
                    <div className="lstep-icon">✍️</div>
                    <div className="lstep-num">04</div>
                    <div className="lstep-title">Writer</div>
                    <div className="lstep-desc">Writes full report with citations</div>
                  </div>
                </div>

                <div className="landing-features">
                  <div className="lfeat">
                    <span className="lfeat-icon">🌐</span>
                    <div>
                      <div className="lfeat-title">Live web search</div>
                      <div className="lfeat-desc">DuckDuckGo — no API key needed</div>
                    </div>
                  </div>
                  <div className="lfeat">
                    <span className="lfeat-icon">📄</span>
                    <div>
                      <div className="lfeat-title">PDF & TXT upload</div>
                      <div className="lfeat-desc">Your documents as sources</div>
                    </div>
                  </div>
                  <div className="lfeat">
                    <span className="lfeat-icon">👁️</span>
                    <div>
                      <div className="lfeat-title">Human-in-the-loop</div>
                      <div className="lfeat-desc">You approve before final report</div>
                    </div>
                  </div>
                  <div className="lfeat">
                    <span className="lfeat-icon">⬇️</span>
                    <div>
                      <div className="lfeat-title">Download report</div>
                      <div className="lfeat-desc">Full markdown with citations</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="landing-right">
                <div className="info-panel">
                  <div className="info-panel-title">⚡ How it works</div>

                  <div className="info-flow">
                    <div className="iflow-step active">
                      <div className="iflow-dot"></div>
                      <div className="iflow-content">
                        <div className="iflow-label">You provide</div>
                        <div className="iflow-text">Research topic + optional PDFs</div>
                      </div>
                    </div>
                    <div className="iflow-step">
                      <div className="iflow-dot"></div>
                      <div className="iflow-content">
                        <div className="iflow-label">Agents work</div>
                        <div className="iflow-text">Web search → summarise → validate</div>
                      </div>
                    </div>
                    <div className="iflow-step">
                      <div className="iflow-dot"></div>
                      <div className="iflow-content">
                        <div className="iflow-label">You review</div>
                        <div className="iflow-text">Approve or request changes</div>
                      </div>
                    </div>
                    <div className="iflow-step">
                      <div className="iflow-dot"></div>
                      <div className="iflow-content">
                        <div className="iflow-label">You get</div>
                        <div className="iflow-text">Full research report + download</div>
                      </div>
                    </div>
                  </div>

                  <div className="info-divider"></div>

                  <div className="info-stack">
                    <div className="info-stack-title">Tech stack</div>
                    <div className="istack-row">
                      <span className="istack-tag">FastAPI</span>
                      <span className="istack-tag">LangChain</span>
                      <span className="istack-tag">GPT-4o-mini</span>
                    </div>
                    <div className="istack-row">
                      <span className="istack-tag">DuckDuckGo</span>
                      <span className="istack-tag">React</span>
                      <span className="istack-tag">Vite</span>
                    </div>
                  </div>

                  <div className="info-divider"></div>

                  <div className="info-tip">
                    💡 <strong>Tip:</strong> Upload a PDF alongside your query
                    for deeper, source-grounded results.
                  </div>
                </div>
              </div>
            </div>
          )}

          {stage === 'running' && session && (
            <>
              <WorkflowDashboard
                sessionId={session.session_id}
                onReviewReady={handleReviewReady}
              />
              {reviewReady && (
                <div className="actions" style={{ marginTop: 20 }}>
                  <button className="btn primary" onClick={() => setStage('review')}>
                    Review findings →
                  </button>
                </div>
              )}
            </>
          )}

          {stage === 'review' && session && (
            <ReviewPanel
              sessionId={session.session_id}
              onApproved={() => setStage('report')}
            />
          )}

          {stage === 'report' && session && (
            <Report
              sessionId={session.session_id}
              onNewResearch={reset}
            />
          )}
        </main>
      </div>
    </div>
  )
}
