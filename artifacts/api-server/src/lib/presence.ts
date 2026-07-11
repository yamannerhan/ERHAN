/** socketId → { userId, visible } */
const socketState = new Map<string, { userId: number; visible: boolean }>();

function recomputeUser(userId: number): boolean {
  for (const st of socketState.values()) {
    if (st.userId === userId && st.visible) return true;
  }
  return false;
}

const foregroundCache = new Set<number>();

function refreshUser(userId: number): void {
  if (recomputeUser(userId)) foregroundCache.add(userId);
  else foregroundCache.delete(userId);
}

export function setPresence(socketId: string, userId: number, visible: boolean): void {
  socketState.set(socketId, { userId, visible });
  refreshUser(userId);
}

export function clearSocketPresence(socketId: string): void {
  const st = socketState.get(socketId);
  socketState.delete(socketId);
  if (st) refreshUser(st.userId);
}

export function isUserForeground(userId: number): boolean {
  return foregroundCache.has(userId);
}
