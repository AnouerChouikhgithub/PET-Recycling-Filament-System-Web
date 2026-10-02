import { useEffect, useState } from 'react'

export type RouteName =
  | 'dashboard'
  | 'machine'
  | 'recycling'
  | 'filament'
  | 'impact'
  | 'history'
  | 'settings'

export const ROUTES: RouteName[] = [
  'dashboard',
  'machine',
  'recycling',
  'filament',
  'impact',
  'history',
  'settings',
]

const VALID = new Set<RouteName>(ROUTES)

function parseHash(): RouteName {
  const hash = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return VALID.has(hash as RouteName) ? (hash as RouteName) : 'dashboard'
}

/** Tiny hash router — keeps the prototype dependency-free. */
export function useRoute(): [RouteName, (r: RouteName) => void] {
  const [route, setRoute] = useState<RouteName>(parseHash)

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash())
      document.querySelector('.app-scroll')?.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = (r: RouteName) => {
    window.location.hash = `#/${r}`
  }

  return [route, navigate]
}

export function navigateTo(r: RouteName): void {
  window.location.hash = `#/${r}`
}
