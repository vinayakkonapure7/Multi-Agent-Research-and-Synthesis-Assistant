// ============================================================
//  API service layer — wired to actual backend
//  Backend: POST /api/generate-report (FormData)
//  Toggle USE_MOCK = true to run without backend (demo mode)
// ============================================================

const USE_MOCK = false // set false when backend is running
const API_BASE = 'http://localhost:8000/api'

// In-memory session store (reset on page refresh)
const sessions = {}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Agent metadata used by both mock and real flows
const AGENT_META = [
  { name: 'researcher',  label: 'Researcher agent',  doneDetail: 'Web search + PDF extraction complete' },
  { name: 'summariser',  label: 'Summariser agent',  doneDetail: 'Key points extracted' },
  { name: 'critic',      label: 'Critic agent',      doneDetail: 'Claims validated' },
  { name: 'writer',      label: 'Writer agent',      doneDetail: 'Report generated' },
]

// ============================================================
//  MOCK helpers (demo mode — no backend needed)
// ============================================================

const MOCK_REPORT_TEXT = `# Impact of RAG on Factual Accuracy in LLMs

## Introduction
Retrieval-Augmented Generation (RAG) improves the factual accuracy of large language models by grounding their output in retrieved source material.

## Background / Context
Large language models can hallucinate facts not present in their training data. RAG addresses this by retrieving relevant documents at inference time and conditioning the model's response on that retrieved content.

## Key Findings
### Reduced Hallucination
RAG consistently reduces hallucination rates across benchmarks by anchoring responses in retrieved context rather than parametric memory alone.

### Retrieval Quality Matters
The quality of the retrieval step is a stronger driver of final accuracy than model size alone. A smaller model with high-quality retrieval often outperforms a larger model without it.

### Citation Grounding
Citation grounding increases user trust in generated reports and makes errors easier to identify and correct.

## Discussion / Analysis
Results vary across domains. RAG performs best on factual, knowledge-intensive tasks and less well on tasks requiring complex multi-step reasoning where retrieved passages may conflict.

## Limitations
Available benchmarks focus on English-language sources. Results on low-resource languages and specialised domains remain understudied.

## Conclusion
RAG is an effective technique for factual research tasks, but outcomes depend heavily on retrieval quality and source reliability. Human review remains valuable for flagged or conflicting claims.

## Sources
- survey_2024.pdf (uploaded)
- Web: arxiv.org, semanticscholar.org`

function parseMockReport(reportText) {
  // Parse markdown report into sections for the Report component
  const lines = reportText.split('\n')
  const sections = []
  let current = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { heading: line.replace('## ', ''), body: '' }
    } else if (line.startsWith('### ') && current) {
      current.body += `\n**${line.replace('### ', '')}**\n`
    } else if (current) {
      current.body += line + '\n'
    }
  }
  if (current) sections.push(current)
  return sections.map(s => ({ ...s, body: s.body.trim() }))
}

// ============================================================
//  REAL backend call
// ============================================================

async function callGenerateReport(query, files = []) {
  const formData = new FormData()
  formData.append('topic', query)
  files.forEach(f => formData.append('files', f))

  const res = await fetch(`${API_BASE}/generate-report`, {
    method: 'POST',
    body: formData,
    // No Content-Type header — browser sets multipart boundary automatically
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Backend error ${res.status}: ${err}`)
  }
  return res.json()
  // Response shape: { report: string, sources: { web, files, urls } }
}

function parseRealReport(data) {
  // Convert backend markdown report string into sections array
  return parseMockReport(data.report)
}

function buildFindingsFromSources(data) {
  // Build findings list from backend sources for the Review screen
  const findings = []

  if (data.sources?.web?.length) {
    findings.push({
      id: 'web-summary',
      text: `Retrieved ${data.sources.web.length} web source(s) via DuckDuckGo search.`,
      status: 'verified',
      sources: data.sources.web.slice(0, 3).map(w => w.url || w.title),
    })
  }

  if (data.sources?.files?.length) {
    data.sources.files.forEach((f, i) => {
      findings.push({
        id: `file-${i}`,
        text: `Extracted and processed content from uploaded file: ${f.name}`,
        status: 'verified',
        sources: [f.name],
      })
    })
  }

  findings.push({
    id: 'synthesis',
    text: 'LangChain synthesis chain (prompt → ChatOpenAI → parser) generated the report.',
    status: 'verified',
    sources: ['LangChain LCEL', 'gpt-4o-mini'],
  })

  if (!data.sources?.web?.length && !data.sources?.files?.length) {
    findings.push({
      id: 'no-sources',
      text: 'No external sources or uploaded files were provided. Report based on model knowledge only.',
      status: 'flagged',
      reason: 'No retrieval sources — accuracy may be lower',
      sources: [],
    })
  }

  return {
    sources_count: (data.sources?.web?.length || 0) + (data.sources?.files?.length || 0),
    key_points: findings.filter(f => f.status === 'verified').length,
    flagged: findings.filter(f => f.status === 'flagged').length,
    findings,
  }
}

// ============================================================
//  Simulated agent progress timeline
//  Works for both mock (timer-based) and real (tied to API call)
// ============================================================

function buildAgentStatus(elapsedMs, totalMs) {
  // Divide total time into 4 phases: 30% / 25% / 25% / 20%
  const phases = [0.30, 0.55, 0.80, 1.0]
  return AGENT_META.map((a, i) => {
    const phaseStart = i === 0 ? 0 : phases[i - 1]
    const phaseEnd = phases[i]
    const progress = elapsedMs / totalMs

    let status, detail
    if (i === 3) {
      // Writer only runs after user approves (HITL)
      status = progress >= phaseEnd ? 'awaiting_approval' : 'pending'
      detail = 'Waiting for your approval'
    } else if (progress >= phaseEnd) {
      status = 'done'
      detail = a.doneDetail
    } else if (progress >= phaseStart) {
      status = 'running'
      detail = 'Working…'
    } else {
      status = 'pending'
      detail = 'Waiting'
    }
    return { name: a.name, label: a.label, status, detail }
  })
}

// ============================================================
//  Public API — components call these functions only
// ============================================================

/**
 * startResearch(query, files)
 * Kicks off a research session.
 * Mock: stores timer + fake data.
 * Real: fires POST /api/generate-report, stores promise + result.
 */
export async function startResearch(query, files = []) {
  const session_id = `session-${Date.now()}`

  if (USE_MOCK) {
    sessions[session_id] = {
      mode: 'mock',
      query,
      startTime: Date.now(),
      totalMs: 6000, // 6s total mock duration
    }
    await wait(300)
    return { session_id, query }
  }

  // Real: fire the backend call immediately, store the promise
  const startTime = Date.now()
  const promise = callGenerateReport(query, files)
  sessions[session_id] = {
    mode: 'real',
    query,
    startTime,
    totalMs: 30000, // assume up to 30s; animation tied to this
    promise,
    result: null,
    error: null,
  }
  // Resolve in background so getStatus can check
  promise
    .then(data => { sessions[session_id].result = data; sessions[session_id].resolvedAt = Date.now() })
    .catch(err => { sessions[session_id].error = err.message })

  await wait(200)
  return { session_id, query }
}

/**
 * getStatus(sessionId)
 * Returns the 4-agent progress snapshot.
 * Polled every ~800ms by WorkflowDashboard.
 */
export async function getStatus(sessionId) {
  const s = sessions[sessionId]
  if (!s) throw new Error('Session not found')

  const elapsed = Date.now() - s.startTime

  // Real mode: if backend responded, snap to "3 agents done + writer awaiting"
  if (s.mode === 'real' && s.result) {
    const agents = AGENT_META.map((a, i) => ({
      name: a.name,
      label: a.label,
      status: i === 3 ? 'awaiting_approval' : 'done',
      detail: i === 3 ? 'Waiting for your approval' : a.doneDetail,
    }))
    return { session_id: sessionId, current_step: 3, review_ready: true, agents }
  }

  if (s.mode === 'real' && s.error) {
    throw new Error(s.error)
  }

  const totalMs = s.mode === 'mock' ? s.totalMs : Math.max(elapsed + 2000, s.totalMs)
  const agents = buildAgentStatus(elapsed, totalMs)
  const doneCount = agents.filter(a => a.status === 'done').length
  const reviewReady = s.mode === 'mock'
    ? elapsed >= s.totalMs * 0.80
    : !!s.result

  return { session_id: sessionId, current_step: doneCount, review_ready: reviewReady, agents }
}

/**
 * getFindings(sessionId)
 * Returns validated findings for the Review screen.
 */
export async function getFindings(sessionId) {
  const s = sessions[sessionId]
  if (!s) throw new Error('Session not found')

  if (s.mode === 'mock') {
    await wait(400)
    return {
      sources_count: 14,
      key_points: 9,
      flagged: 2,
      findings: [
        { id: 'f1', text: 'RAG reduces hallucination rates by grounding LLM responses in retrieved context.', status: 'verified', sources: ['survey_2024.pdf', 'web: arxiv', 'web: blog'] },
        { id: 'f2', text: 'Retrieval quality directly affects final answer accuracy more than model size alone.', status: 'verified', sources: ['survey_2024.pdf', 'web: paper'] },
        { id: 'f3', text: 'Exact accuracy gains vary widely; one source reports figures others do not support.', status: 'flagged', reason: 'Conflicting evidence across sources', sources: ['web: blog'] },
        { id: 'f4', text: 'Citation grounding improves user trust in generated research reports.', status: 'verified', sources: ['survey_2024.pdf'] },
        { id: 'f5', text: 'Some claimed benchmark numbers could not be traced to a primary source.', status: 'flagged', reason: 'Source not verifiable', sources: ['web: forum'] },
      ],
    }
  }

  // Real: build findings from the backend response sources
  if (!s.result) await s.promise // wait if somehow called before resolved
  return buildFindingsFromSources(s.result)
}

/**
 * submitReview(sessionId, action)
 * HITL: 'approve' | 'request_changes' | 'reject'
 */
export async function submitReview(sessionId, action) {
  await wait(300)
  // In both mock and real, this is just an in-memory flag
  // When LangGraph is added, this will POST to /api/research/{id}/review
  if (sessions[sessionId]) sessions[sessionId].reviewAction = action
  return { ok: true, action }
}

/**
 * getReport(sessionId)
 * Returns the final report sections.
 */
export async function getReport(sessionId) {
  const s = sessions[sessionId]
  if (!s) throw new Error('Session not found')

  if (s.mode === 'mock') {
    await wait(600)
    return {
      title: 'Impact of RAG on Factual Accuracy in LLMs',
      generated_at: 'Demo report',
      sections: parseMockReport(MOCK_REPORT_TEXT),
      raw: MOCK_REPORT_TEXT,
    }
  }

  if (!s.result) await s.promise
  return {
    title: s.query,
    generated_at: new Date().toLocaleString(),
    sections: parseRealReport(s.result),
    raw: s.result.report,
    sources: s.result.sources,
  }
}
