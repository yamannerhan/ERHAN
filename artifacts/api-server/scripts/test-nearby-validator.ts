/**
 * Yakındaki ilanlar validator / mesafe testleri
 * Çalıştır: pnpm exec tsx --tsconfig ./tsconfig.json ./scripts/test-nearby-validator.ts
 */
import {
  parseCoord,
  parseListingCoord,
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

assert(parseListingCoord(null) === null, "null coord");
assert(parseListingCoord("") === null, "empty coord");
assert(parseListingCoord(0) === null, "zero coord rejected");
assert(parseListingCoord("40.8028") === 40.8028, "string coord");

const near = haversineKm(40.9819, 29.0578, 40.99, 29.06);
const far = haversineKm(40.9819, 29.0578, 41.05, 28.95);
assert(near < far, "haversine nearer < farther");
assert(near < 5, "kadikoy local < 5km");

const geo = resolveGeoFromCityText("İstanbul / Sancaktepe / Samandıra");
assert(geo && geo.accuracy === "district", "samandira district");

const gebze = resolveGeoFromCityText("Kocaeli / Gebze");
const tuzla = resolveGeoFromCityText("İstanbul / Tuzla");
assert(gebze && tuzla, "gebze/tuzla resolve");
const gt = haversineKm(gebze!.lat, gebze!.lng, tuzla!.lat, tuzla!.lng);
assert(gt < 25, `gebze-tuzla should be <25km, got ${gt}`);
assert(gt > 5, `gebze-tuzla should be >5km, got ${gt}`);

const reverse = resolveGeoFromCityText("Gebze / Kocaeli");
assert(reverse && reverse.accuracy === "district", "gebze reverse order");
const aloneTuzla = resolveGeoFromCityText("Tuzla");
assert(aloneTuzla && aloneTuzla.accuracy === "district", "tuzla alone");

console.log("OK nearby validator tests passed");
