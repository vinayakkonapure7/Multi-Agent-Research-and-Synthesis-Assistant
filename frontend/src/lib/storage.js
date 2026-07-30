/**
 * Local persistence.
 *
 * The backend has no "list all projects" endpoint, so the browser keeps a
 * lightweight index of projects this user has opened. Each entry is just
 * enough to render the recent-projects list without a network call; the
 * authoritative data is always re-fetched from the API when a project opens.
 *
 * Anything stored here is disposable — if it is cleared, the user loses the
 * shortcut list but no actual work, because every project still lives in the
 * backend database under its id.
 */

const RECENT_KEY = 'inkwell.recentProjects'
const THEME_KEY = 'inkwell.theme'
const MAX_RECENT = 20

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private mode) — the app still works, it just
    // won't remember the project list next session.
  }
}

export function getRecentProjects() {
  const list = read(RECENT_KEY, [])
  return Array.isArray(list) ? list : []
}

/**
 * Adds or updates a project in the recent list and moves it to the front.
 * `patch` may carry topic, stage, sectionCount, approvedCount, etc.
 */
export function rememberProject(id, patch = {}) {
  if (!id) return
  const list = getRecentProjects().filter(p => p.id !== id)
  const previous = getRecentProjects().find(p => p.id === id) || {}
  const entry = {
    ...previous,
    ...patch,
    id,
    lastOpenedAt: new Date().toISOString(),
  }
  write(RECENT_KEY, [entry, ...list].slice(0, MAX_RECENT))
}

export function forgetProject(id) {
  write(RECENT_KEY, getRecentProjects().filter(p => p.id !== id))
}

export function getStoredTheme() {
  const stored = read(THEME_KEY, null)
  return stored === 'dark' || stored === 'light' ? stored : null
}

export function storeTheme(theme) {
  write(THEME_KEY, theme)
}
