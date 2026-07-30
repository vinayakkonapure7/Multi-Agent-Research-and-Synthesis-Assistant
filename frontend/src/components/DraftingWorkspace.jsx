import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'
import { rememberProject } from '../lib/storage'
import SectionCard from './SectionCard.jsx'
import './DraftingWorkspace.css'

export default function DraftingWorkspace({ project }) {
  const [sections, setSections] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loadingSections, setLoadingSections] = useState(true)

  const refreshSections = useCallback(async () => {
    const data = await api.listSections(project.id)
    setSections(data)
    rememberProject(project.id, { sectionCount: data.length })
    // Jump to first non-approved section automatically on load
    const firstPending = data.findIndex(s => s.status !== 'approved')
    setActiveIndex(firstPending === -1 ? data.length - 1 : firstPending)
    setLoadingSections(false)
  }, [project.id])

  useEffect(() => { refreshSections() }, [refreshSections])

  function handleSectionUpdated(updatedSection) {
    setSections(prev => prev.map(s => s.id === updatedSection.id ? updatedSection : s))
  }

  function goToNextPending(fromIndex) {
    const next = sections.findIndex((s, i) => i > fromIndex && s.status !== 'approved')
    if (next !== -1) {
      setActiveIndex(next)
    } else if (fromIndex + 1 < sections.length) {
      setActiveIndex(fromIndex + 1)
    }
  }

  if (loadingSections) {
    return <div className="workspace-loading">Loading your outline…</div>
  }

  const approvedCount = sections.filter(s => s.status === 'approved').length
  const allApproved = sections.length > 0 && approvedCount === sections.length
  const remainingCount = sections.length - approvedCount
  const activeSection = sections[activeIndex]

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <div className="workspace-progress">
          <div className="workspace-progress__count">
            <strong>{approvedCount} of {sections.length}</strong>
            <span>approved</span>
          </div>
          <div className="workspace-progress__bar">
            <div
              className="workspace-progress__fill"
              style={{ width: sections.length ? `${(approvedCount / sections.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
        <h2 className="workspace-toc__heading">Contents</h2>
        <ol className="workspace-toc">
          {sections.map((s, i) => (
            <li key={s.id}>
              <button
                className={`workspace-toc__item ${i === activeIndex ? 'is-active' : ''} status-${s.status}`}
                onClick={() => setActiveIndex(i)}
              >
                <span className="workspace-toc__num">{pad(i + 1)}</span>
                <span className="workspace-toc__title">{s.title}</span>
                <span className="workspace-toc__badge">{badgeFor(s.status)}</span>
              </button>
            </li>
          ))}
        </ol>

        {allApproved ? (
          <a className="btn btn--primary workspace-export" href={api.exportUrl(project.id)} target="_blank" rel="noreferrer">
            ↓ Export final report (.docx)
          </a>
        ) : sections.length > 0 ? (
          <div className="workspace-export-pending">
            <button type="button" className="btn btn--primary workspace-export" disabled>
              Export final report (.docx)
            </button>
            <span className="workspace-export-note">
              {remainingCount} {remainingCount === 1 ? 'section' : 'sections'} still {remainingCount === 1 ? 'needs' : 'need'} approval
            </span>
          </div>
        ) : null}
      </aside>

      <main className="workspace-main">
        {activeSection && (
          <SectionCard
            key={activeSection.id}
            projectId={project.id}
            section={activeSection}
            onUpdated={handleSectionUpdated}
            onApproved={() => goToNextPending(activeIndex)}
          />
        )}
      </main>
    </div>
  )
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function badgeFor(status) {
  return {
    pending: '·',
    drafting: '…',
    awaiting_review: '?',
    approved: '✓',
  }[status] || ''
}
