import React from "react";

const STORAGE_KEY = "og_read_listing_ids";
const MAX_IDS = 2000;

function readSet(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0));
  } catch {
    return new Set();
  }
}

function writeSet(ids: Set<number>) {
  try {
    const list = [...ids];
    const trimmed = list.length > MAX_IDS ? list.slice(list.length - MAX_IDS) : list;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
}

export function isListingRead(id: number): boolean {
  if (!Number.isFinite(id) || id <= 0) return false;
  return readSet().has(id);
}

export function markListingRead(id: number): void {
  if (!Number.isFinite(id) || id <= 0) return;
  const set = readSet();
  if (set.has(id)) return;
  set.add(id);
  writeSet(set);
  try {
    window.dispatchEvent(new CustomEvent("og:listing-read", { detail: { id } }));
  } catch {
    /* ignore */
  }
}

export function useListingRead(id: number): boolean {
  const [read, setRead] = React.useState(() => isListingRead(id));

  React.useEffect(() => {
    setRead(isListingRead(id));
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRead(isListingRead(id));
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: number }>).detail;
      if (detail?.id === id) setRead(true);
      else setRead(isListingRead(id));
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("og:listing-read", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("og:listing-read", onCustom);
    };
  }, [id]);

  return read;
}
