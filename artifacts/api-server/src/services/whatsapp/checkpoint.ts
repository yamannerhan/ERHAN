import type { Checkpoint } from "./types";

/**
 * Mesaj checkpoint'ten yeni mi?
 * Sıra: timestamp, sonra messageId.
 * Aynı saniyede farklı ID'ler yeni kabul edilir.
 */
export function isMessageNewerThanCheckpoint(
  messageTimestamp: number,
  messageId: string,
  checkpoint: Checkpoint,
): boolean {
  const cpTs = checkpoint.timestamp;
  const cpId = checkpoint.messageId;
  if (cpTs == null || !cpId) return true;
  if (messageTimestamp > cpTs) return true;
  if (messageTimestamp < cpTs) return false;
  return messageId !== cpId;
}

export function compareMessages(
  a: { timestamp: number; id: string },
  b: { timestamp: number; id: string },
): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function daysAgoUnixSeconds(days: number, nowMs = Date.now()): number {
  return Math.floor((nowMs - days * 24 * 60 * 60 * 1000) / 1000);
}

export function unixSecondsToDate(sec: number): Date {
  return new Date(sec * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
