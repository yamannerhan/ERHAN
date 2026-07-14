/**
 * Yakındaki ilanlar validator / mesafe testleri
 * Çalıştır: pnpm exec tsx --tsconfig ./tsconfig.json ./scripts/test-nearby-validator.ts
 */
import {
  parseCoord,
  parseNearbyRadius,
  parseNearbySort,
} from "../src/lib/nearby-validator";
import { haversineKm, resolveGeoFromCityText } from "../src/lib/geo-centers";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseNearbyRadius(10) === 10, "radius 10 ok");
assert(parseNearbyRadius(100) === 100, "radius 100 ok");
assert(parseNearbyRadius(15) === null, "radius 15 rejected");
assert(parseNearbyRadius(200) === null, "radius 200 rejected");
assert(parseCoord(91, "lat") === null, "lat 91 rejected");
assert(parseCoord(181, "lng") === null, "lng 181 rejected");
assert(parseCoord(41.0082, "lat") !== null, "lat valid");
assert(parseNearbySort("foo") === "distance", "sort default");
assert(parseNearbySort("newest") === "newest", "sort newest");

const near = haversineKm(40.9819, 29.0578, 40.99, 29.06);
const far = haversineKm(40.9819, 29.0578, 41.05, 28.95);
assert(near < far, "haversine nearer < farther");
assert(near < 5, "kadikoy local < 5km");

const geo = resolveGeoFromCityText("İstanbul / Sancaktepe / Samandıra");
assert(geo && geo.accuracy === "district", "samandira district");

console.log("OK nearby validator tests passed");
