import * as React from "react"
import { subscribeMediaQuery } from "@/lib/match-media-subscribe"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    onChange()
    const unsub = subscribeMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, onChange)
    return unsub
  }, [])

  return !!isMobile
}
