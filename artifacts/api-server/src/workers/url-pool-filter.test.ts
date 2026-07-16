import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUrlPoolJobPosting } from "../lib/job-parsing";

describe("isUrlPoolJobPosting — gevşek havuz filtresi", () => {
  it("accepts typical security hiring posts", () => {
    assert.equal(
      isUrlPoolJobPosting("İstanbul Anadolu yakası özel güvenlik görevlisi aranıyor. Maaş 35.000 TL. Tel: 0532 111 22 33"),
      true,
    );
  });

  it("accepts short pool posts with security word", () => {
    assert.equal(
      isUrlPoolJobPosting("Gebze güvenlik personel aranıyor acil"),
      true,
    );
  });

  it("accepts phone + job length without explicit security keyword", () => {
    assert.equal(
      isUrlPoolJobPosting("Kartal proje için personel alınacaktır. Vardiya 12/36. İletişim 05321112233 lütfen yazın hemen."),
      true,
    );
  });

  it("rejects clear job seeker", () => {
    assert.equal(
      isUrlPoolJobPosting("Merhaba iş arıyorum sertifikam var CV gönderebilirim DM"),
      false,
    );
  });

  it("rejects sponsored spam", () => {
    assert.equal(
      isUrlPoolJobPosting("#sponsorlu Garanti BBVA hemen keşfet kampanya"),
      false,
    );
  });
});
