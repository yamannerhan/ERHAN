import { NEARBY_RADII_KM, type NearbyRadiusKm, type NearbySort } from "./nearby-types";

export type { NearbyRadiusKm, NearbySort };

export function parseNearbyRadius(raw: unknown): NearbyRadiusKm | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return (NEARBY_RADII_KM as readonly number[]).includes(n) ? (n as NearbyRadiusKm) : null;
}

export function parseCoord(raw: unknown, kind: "lat" | "lng"): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (kind === "lat" && (n < -90 || n > 90)) return null;
  if (kind === "lng" && (n < -180 || n > 180)) return null;
  return Math.round(n * 1e5) / 1e5;
}

export function parseNearbySort(raw: unknown): NearbySort {
  const s = String(raw || "distance");
  if (s === "salary" || s === "newest" || s === "views" || s === "distance") return s;
  return "distance";
}
