import { useState, useEffect, useCallback } from 'react'
import api from './api/client'
import { useRoute, routes } from './lib/useRoute'
import { useTheme } from './lib/useTheme'
import { rememberProject } from './lib/storage'
import { describeError } from './lib/errors'
import AppShell from './components/AppShell.jsx'
import HomeScreen from './components/HomeScreen.jsx'
import SourcesScreen from './components/SourcesScreen.jsx'
import OutlineEditor from './components/OutlineEditor.jsx'
import DraftingWorkspace from './components/DraftingWorkspace.jsx'

/**
 * Routing and project loading.
 *
 * The project id lives in the URL hash, so a refresh re-fetches the project
 * from the API instead of dropping the user back to an empty form. Stage
 * changes are pushed to the hash too, which makes the browser back button
 * behave the way people expect.
 */
export default function App() {
  const { route, navigate } = useRoute()
  const { theme, toggle } = useTheme()

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [retryingLoad, setRetryingLoad] = useState(false)

  const projectId = route.name === 'project' ? route.projectId : null
  const stage = route.name === 'project' ? route.stage : null

  const loadProject = useCallback((id, isRetry = false) => {
    if (isRetry) setRetryingLoad(true)
    else setLoading(true)
    setLoadError('')

    api.getProject(id)
      .then(p => {
        setProject(p)
        rememberProject(p.id, { topic: p.topic, stage, status: p.status })
      })
      .catch(err => {
        setLoadError(describeError(err, 'That report could not be found. It may have been deleted.'))
      })
      .finally(() => {
        setLoading(false)
        setRetryingLoad(false)
      })
  }, [stage])

  // Load (or reload) the project whenever the id in the URL changes.
  useEffect(() => {
    if (!projectId) {
      setProject(null)
      setLoadError('')
      return
    }
    if (project?.id === projectId) return

    loadProject(projectId)
  }, [projectId, project?.id, stage, loadProject])

  // Keep the locally stored stage in step with the URL so the recent list
  // shows where the user actually left off.
  useEffect(() => {
    if (projectId && stage) rememberProject(projectId, { stage })
  }, [projectId, stage])

  const goHome = useCallback(() => navigate(routes.home()), [navigate])

  function handleProjectCreated(p) {
    setProject(p)
    navigate(routes.sources(p.id))
  }

  function handleOpenProject(entry) {
    const target = entry.status === 'completed' ? 'draft' : (entry.stage || 'sources')
    navigate(`/p/${entry.id}/${target}`)
  }

  function handleStepClick(nextStage) {
    if (projectId) navigate(`/p/${projectId}/${nextStage}`)
  }

  // ---- home ----
  if (route.name === 'home') {
    return (
      <AppShell theme={theme} onToggleTheme={toggle} onHome={goHome}>
        <HomeScreen
          onOpenProject={handleOpenProject}
          onProjectCreated={handleProjectCreated}
        />
      </AppShell>
    )
  }

  // ---- project, still resolving ----
  if (loading || (!project && !loadError)) {
    return (
      <AppShell theme={theme} onToggleTheme={toggle} onHome={goHome}>
        <div className="app-status">Opening your report…</div>
      </AppShell>
    )
  }

  if (loadError) {
    return (
      <AppShell theme={theme} onToggleTheme={toggle} onHome={goHome}>
        <div className="app-status">
          <p>{loadError}</p>
          <div className="app-status__actions">
            <button className="btn btn--ghost" onClick={() => loadProject(projectId, true)} disabled={retryingLoad}>
              {retryingLoad ? 'Retrying…' : 'Try again'}
            </button>
            <button className="btn btn--ghost" onClick={goHome}>Back to your reports</button>
          </div>
        </div>
      </AppShell>
    )
  }

  // How far the user is allowed to jump back and forth in the stepper.
  const furthest = project.status === 'outline_approved' || project.status === 'completed'
    ? 'draft'
    : stage

  return (
    <AppShell
      theme={theme}
      onToggleTheme={toggle}
      onHome={goHome}
      subtitle={project.topic}
      stage={stage}
      furthestStage={furthest}
      onStepClick={handleStepClick}
    >
      {stage === 'sources' && (
        <SourcesScreen
          project={project}
          onContinue={() => navigate(routes.outline(project.id))}
        />
      )}

      {stage === 'outline' && (
        <OutlineEditor
          project={project}
          onOutlineApproved={() => {
            setProject(p => ({ ...p, status: 'outline_approved' }))
            navigate(routes.draft(project.id))
          }}
          onBack={() => navigate(routes.sources(project.id))}
        />
      )}

      {stage === 'draft' && <DraftingWorkspace project={project} />}
    </AppShell>
  )
}
