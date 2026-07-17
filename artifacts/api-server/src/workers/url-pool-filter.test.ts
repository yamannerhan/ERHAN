import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUrlPoolJobPosting } from "../lib/job-parsing";

describe("isUrlPoolJobPosting — sadece özel güvenlik ilanları", () => {
  it("accepts typical security hiring posts", () => {
    assert.equal(
      isUrlPoolJobPosting("İstanbul Anadolu yakası özel güvenlik görevlisi aranıyor. Maaş 35.000 TL. Tel: 0532 111 22 33"),
      true,
    );
  });

  it("accepts silahli / silahsiz keywords", () => {
    assert.equal(
      isUrlPoolJobPosting("Gebze silahlı güvenlik personel aranıyor acil proje"),
      true,
    );
    assert.equal(
      isUrlPoolJobPosting("Silahsız güvenlik alınacaktır AVM. Başvuru: 05321112233"),
      true,
    );
  });

  it("accepts güvenlik danışman", () => {
    assert.equal(
      isUrlPoolJobPosting("Kurumsal güvenlik danışmanı aranıyor. Tecrübeli ÖGG. İletişim 0532 111 22 33"),
      true,
    );
  });

  it("rejects driver / cook without security", () => {
    assert.equal(
      isUrlPoolJobPosting("Şoför kurulacak acil. Ehliyet şart. Tel 05321112233"),
      false,
    );
    assert.equal(
      isUrlPoolJobPosting("Yemekçi aşçı aranıyor lokanta personel. Maaş iyi 05321112233"),
      false,
    );
  });

  it("rejects generic project staff without security keyword", () => {
    assert.equal(
      isUrlPoolJobPosting("Kartal proje için personel alınacaktır. Vardiya 12/36. İletişim 05321112233 lütfen yazın hemen."),
      false,
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

  it("rejects channel noise that only mentions özel güvenlik", () => {
    assert.equal(
      isUrlPoolJobPosting("Bu grup özel güvenlik çalışanları içindir. Kurallara uyun, reklam yasak."),
      false,
    );
    assert.equal(
      isUrlPoolJobPosting("Hoşgeldiniz! Özel güvenlik sohbet kanalına katıldınız."),
      false,
    );
  });

  it("accepts short security hiring without phone", () => {
    assert.equal(
      isUrlPoolJobPosting("Gebze özel güvenlik görevlisi aranıyor acil proje vardiya"),
      true,
    );
  });
});
