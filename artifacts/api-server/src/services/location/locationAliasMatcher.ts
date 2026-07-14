import type { LocationCatalog, CatalogAlias } from "./locationCatalog";
import { normalizeAliasKey, compactKey } from "./turkishTextNormalizer";

export function matchAliases(term: string, catalog: LocationCatalog): CatalogAlias[] {
  const n = normalizeAliasKey(term);
  const c = compactKey(term);
  const hits = [
    ...(catalog.aliasesByNorm.get(n) ?? []),
    ...(c !== n ? catalog.aliasesByNorm.get(c) ?? [] : []),
  ];
  const seen = new Set<number>();
  return hits.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}
