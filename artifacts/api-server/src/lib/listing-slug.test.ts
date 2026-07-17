import assert from "node:assert/strict";
import test from "node:test";

process.env["DATABASE_URL"] = process.env["DATABASE_URL"] || "postgresql://test:test@127.0.0.1:1/test";

const {
  buildListingSlug,
  listingSeoPath,
  slugifyListingSegment,
  splitListingLocation,
} = await import("@workspace/db");

test("Türkçe karakterler slug'da dönüşür", () => {
  assert.equal(
    buildListingSlug("Güvenlik Personeli (Fabrika)", "Gebze / Kocaeli"),
    "guvenlik-personeli-fabrika-gebze-kocaeli",
  );
});

test("slugify: küçük harf, tire, özel karakter temizliği", () => {
  assert.equal(slugifyListingSegment("  Çığlık!!  Şölen__ "), "ciglik-solen");
  assert.equal(slugifyListingSegment("---a---b---"), "a-b");
});

test("konum: ilçe / şehir ayrışır", () => {
  assert.deepEqual(splitListingLocation("Gebze / Kocaeli"), {
    district: "Gebze",
    city: "Kocaeli",
  });
  assert.deepEqual(splitListingLocation("İstanbul"), {
    district: null,
    city: "İstanbul",
  });
});

test("listingSeoPath id + slug", () => {
  assert.equal(
    listingSeoPath(21194, "guvenlik-personeli-fabrika-gebze-kocaeli"),
    "/ilan/21194/guvenlik-personeli-fabrika-gebze-kocaeli",
  );
});
