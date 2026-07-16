import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreListingMatch, validateJobPrefs } from "./scoring";

const basePrefs = {
  preferredCities: ["İstanbul"],
  preferredDistricts: ["Tuzla"],
  nearbyDistrictsEnabled: true,
  maximumDistance: 20,
  securityLicenseTypes: ["armed", "has_card"],
  employmentTypes: ["fulltime"],
  shiftPreferences: ["night", "any_shift"],
  projectTypes: ["factory", "any_project"],
  minimumSalary: 30000,
  benefits: ["service"],
  experienceLevel: "1_3",
  preferredRoles: ["ogg"],
  drivingLicense: false,
  srcCertificate: false,
};

describe("job-match scoring", () => {
  it("validates required fields", () => {
    const errors = validateJobPrefs({});
    assert.ok(errors.some((e) => e.includes("il")));
    assert.ok(errors.some((e) => e.includes("çalışma")));
  });

  it("scores matching listing high", () => {
    const r = scoreListingMatch(basePrefs, {
      id: 1,
      title: "Silahlı Özel Güvenlik Görevlisi",
      city: "İstanbul / Tuzla",
      workType: "Tam Zamanlı",
      salary: "45000 TL",
      description: "Fabrika projesi gece vardiyası servis imkânı",
    });
    assert.equal(r.hardFail, false);
    assert.ok(r.score >= 75, `score=${r.score}`);
  });

  it("hard-fails armed listing for unarmed-only user", () => {
    const r = scoreListingMatch({
      ...basePrefs,
      securityLicenseTypes: ["unarmed"],
    }, {
      id: 2,
      title: "Silahlı güvenlik aranıyor",
      city: "İstanbul",
      description: "Silahlı özel güvenlik",
    });
    assert.equal(r.hardFail, true);
    assert.equal(r.score, 0);
  });

  it("soft match allows nearby alternatives", () => {
    const r = scoreListingMatch(basePrefs, {
      id: 3,
      title: "Güvenlik personeli",
      city: "Kocaeli",
      description: "Site projesi",
    }, { soft: true });
    assert.equal(r.hardFail, false);
    assert.ok(r.score > 0);
  });
});
