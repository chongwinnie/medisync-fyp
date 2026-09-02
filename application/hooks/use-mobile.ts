import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Returns whether the viewport is mobile-sized.
 * Until mounted, returns `false` (same as SSR) to avoid hydration mismatches (F-14).
 * Callers that need "unknown until mounted" should track their own mounted flag.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
