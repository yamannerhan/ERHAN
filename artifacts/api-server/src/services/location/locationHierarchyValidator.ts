import type { CatalogLocation, LocationCatalog } from "./locationCatalog";

export function validateHierarchy(
  child: CatalogLocation,
  parent: CatalogLocation | null | undefined,
): boolean {
  if (!parent) return true;
  if (child.provinceId && parent.locationType === "province") {
    return child.provinceId === parent.id;
  }
  if (child.districtId && parent.locationType === "district") {
    return child.districtId === parent.id;
  }
  if (child.parentId) return child.parentId === parent.id;
  return true;
}

export function resolveProvinceForDistrict(
  district: CatalogLocation,
  catalog: LocationCatalog,
): CatalogLocation | null {
  if (!district.provinceId) return null;
  return catalog.byId.get(district.provinceId) ?? null;
}

/** Aynı isimli genel mahalle — ilçe bağlamı zorunlu */
export function requiresDistrictContext(name: string): boolean {
  const n = name
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
  return [
    "cumhuriyet",
    "yeni mahalle",
    "sanayi mahallesi",
    "merkez",
    "ataturk mahallesi",
    "ataturk",
  ].some((x) => n.includes(x));
}
