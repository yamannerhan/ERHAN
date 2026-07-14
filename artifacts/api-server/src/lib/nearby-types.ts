export const NEARBY_RADII_KM = [5, 10, 25, 50, 100] as const;
export type NearbyRadiusKm = (typeof NEARBY_RADII_KM)[number];
export type NearbySort = "distance" | "salary" | "newest" | "views";
