import { useState, useEffect, useCallback } from 'react'

/**
 * Hash-based routing, deliberately kept to ~40 lines instead of pulling in
 * react-router. Three shapes exist:
 *
 *   #/                     -> home (recent projects + new project form)
 *   #/p/{id}/sources       -> attach source material
 *   #/p/{id}/outline       -> review and edit the proposed outline
 *   #/p/{id}/draft         -> section-by-section drafting
 *
 * Putting the project id in the URL is what makes a page refresh survivable:
 * the app re-reads the id from the address bar and re-fetches from the API,
 * rather than losing everything held in React state.
 */

export function parseHash(hash) {
  const clean = (hash || '').replace(/^#/, '')
  const parts = clean.split('/').filter(Boolean)

  if (parts[0] === 'p' && parts[1]) {
    const stage = parts[2] || 'sources'
    return { name: 'project', projectId: parts[1], stage }
  }
  return { name: 'home' }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((path) => {
    const target = path.startsWith('#') ? path : `#${path}`
    if (window.location.hash === target) {
      setRoute(parseHash(target))
    } else {
      window.location.hash = target
    }
  }, [])

  const replace = useCallback((path) => {
    const target = path.startsWith('#') ? path : `#${path}`
    window.history.replaceState(null, '', target)
    setRoute(parseHash(target))
  }, [])

  return { route, navigate, replace }
}

export const routes = {
  home: () => '/',
  sources: (id) => `/p/${id}/sources`,
  outline: (id) => `/p/${id}/outline`,
  draft: (id) => `/p/${id}/draft`,
}
