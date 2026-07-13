/** Eski Android / Safari: MediaQueryList.addListener fallback */
export function subscribeMediaQuery(
  query: string,
  onChange: () => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mq = window.matchMedia(query);
  const handler = () => onChange();
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}
