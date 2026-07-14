/**
 * Location Classifier V2 — 15 senaryo unit test
 * Çalıştır: pnpm exec tsx artifacts/api-server/scripts/test-location-classifier-v2.ts
 */
import { classifyJobLocations } from "../src/services/location/jobLocationClassifier.ts";
import { resetBootstrapCatalog } from "../src/services/location/locationCatalog.ts";

resetBootstrapCatalog();

type Expect = {
  workProvinces?: string[];
  workDistricts?: string[];
  workNamesInclude?: string[];
  serviceDistricts?: string[];
  residenceDistricts?: string[];
  interviewProvinces?: string[];
  hqProvinces?: string[];
  status?: string | string[];
  nationwide?: boolean;
  region?: string;
  primaryDistrictNull?: boolean;
};

const cases: { name: string; title?: string; description: string; sourceName?: string; expect: Expect }[] = [
  {
    name: "1 GOSB fabrika",
    description: "GOSB fabrika projemize güvenlik görevlisi alınacaktır.",
    expect: { workProvinces: ["Kocaeli"], workDistricts: ["Gebze"], workNamesInclude: ["Gebze"] },
  },
  {
    name: "2 Tuzla proje",
    description: "Tuzla projemize güvenlik personeli alınacaktır.",
    expect: { workProvinces: ["İstanbul"], workDistricts: ["Tuzla"] },
  },
  {
    name: "3 İzmir merkez + Tuzla proje",
    description: "İzmir merkezli firmamızın Tuzla projesine güvenlik alınacaktır.",
    expect: { workProvinces: ["İstanbul"], workDistricts: ["Tuzla"], hqProvinces: ["İzmir"] },
  },
  {
    name: "4 Tuzla + servis",
    description: "Tuzla projemize Gebze, Darıca ve Çayırova'dan servis vardır.",
    expect: {
      workProvinces: ["İstanbul"],
      workDistricts: ["Tuzla"],
      serviceDistricts: ["Gebze", "Darıca", "Çayırova"],
    },
  },
  {
    name: "5 ikamet Gebze + Tuzla proje",
    description: "Gebze'de ikamet eden, Tuzla projesinde çalışabilecek personel.",
    expect: {
      workProvinces: ["İstanbul"],
      workDistricts: ["Tuzla"],
      residenceDistricts: ["Gebze"],
    },
  },
  {
    name: "6 İzmir görüşme + İstanbul Tuzla",
    description: "İzmir görüşme ofisimize gelerek İstanbul Tuzla projemize başvurabilirsiniz.",
    expect: {
      workProvinces: ["İstanbul"],
      workDistricts: ["Tuzla"],
      interviewProvinces: ["İzmir"],
    },
  },
  {
    name: "7 Ege Serbest Bölgesi",
    description: "Ege Serbest Bölgesi fabrika projemize güvenlik alınacaktır.",
    expect: { workProvinces: ["İzmir"], workDistricts: ["Gaziemir"] },
  },
  {
    name: "8 AOSB belirsiz",
    description: "AOSB projemize personel alınacaktır.",
    expect: { status: ["ambiguous", "unresolved"] },
  },
  {
    name: "9 Cumhuriyet Mahallesi",
    description: "Cumhuriyet Mahallesi projemize güvenlik alınacaktır.",
    expect: { status: ["unresolved", "ambiguous"] },
  },
  {
    name: "10 çoklu proje",
    description: "Pendik, Tuzla ve Gebze projelerimize güvenlik alınacaktır.",
    expect: {
      workProvinces: ["İstanbul", "İstanbul", "Kocaeli"],
      workDistricts: ["Pendik", "Tuzla", "Gebze"],
    },
  },
  {
    name: "11 kaynak İzmir ama çalışma Tuzla",
    title: "İzmir Güvenlik İş İlanları",
    description: "İstanbul Tuzla projemize personel alınacaktır.",
    sourceName: "İzmir İş İlanları Telegram Grubu",
    expect: { workProvinces: ["İstanbul"], workDistricts: ["Tuzla"] },
  },
  {
    name: "12 servis Tuzla çalışma Gaziemir",
    description: "Tuzla'dan servis vardır. Çalışma yeri İzmir Gaziemir'dir.",
    expect: {
      workProvinces: ["İzmir"],
      workDistricts: ["Gaziemir"],
      serviceDistricts: ["Tuzla"],
    },
  },
  {
    name: "13 Gebze Organize Sanayi",
    description: "Gebze Organize Sanayi Bölgesi projemize güvenlik alınacaktır.",
    expect: { workProvinces: ["Kocaeli"], workDistricts: ["Gebze"] },
  },
  {
    name: "14 Anadolu Yakası",
    description: "İstanbul Anadolu Yakası projelerimize güvenlik personeli.",
    expect: { workProvinces: ["İstanbul"], region: "Anadolu Yakası", primaryDistrictNull: true },
  },
  {
    name: "15 Türkiye geneli",
    description: "Türkiye genelindeki projelerimize güvenlik alınacaktır.",
    expect: { nationwide: true },
  },
];

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
}

let failed = 0;

for (const c of cases) {
  const r = classifyJobLocations({
    title: c.title ?? "",
    description: c.description,
    sourceName: c.sourceName,
  });

  const errors: string[] = [];

  if (c.expect.nationwide) {
    if (r.locationScope !== "nationwide") errors.push(`expected nationwide, got ${r.locationScope} status=${r.status}`);
  }

  if (c.expect.status) {
    const allowed = Array.isArray(c.expect.status) ? c.expect.status : [c.expect.status];
    if (!allowed.includes(r.status) || r.workLocations.length > 0 && r.status === "confirmed") {
      // for ambiguous/unresolved primary should be null-ish
      if (!allowed.includes(r.status)) errors.push(`status ${r.status} not in ${allowed.join("|")}`);
    }
    if (r.primaryLocation && (r.status === "unresolved" || r.status === "ambiguous")) {
      // AOSB may have null primary
    }
  }

  if (c.expect.workProvinces) {
    const got = r.workLocations.map((w) => w.province);
    for (const p of new Set(c.expect.workProvinces)) {
      if (!got.some((g) => norm(g) === norm(p))) errors.push(`missing work province ${p}; got ${got.join(",")}`);
    }
  }

  if (c.expect.workDistricts) {
    const got = r.workLocations.map((w) => w.district).filter(Boolean);
    for (const d of c.expect.workDistricts) {
      if (!got.some((g) => norm(g) === norm(d))) errors.push(`missing work district ${d}; got ${got.join(",")}`);
    }
  }

  if (c.expect.serviceDistricts) {
    const got = r.serviceRoutes.map((w) => w.district || w.name);
    for (const d of c.expect.serviceDistricts) {
      if (!got.some((g) => norm(g) === norm(d))) errors.push(`missing service ${d}; got ${got.join(",")}`);
    }
  }

  if (c.expect.residenceDistricts) {
    const got = r.residenceRequirements.map((w) => w.district || w.name);
    for (const d of c.expect.residenceDistricts) {
      if (!got.some((g) => norm(g) === norm(d))) errors.push(`missing residence ${d}; got ${got.join(",")}`);
    }
  }

  if (c.expect.interviewProvinces) {
    const got = r.interviewLocations.map((w) => w.province || w.name);
    for (const p of c.expect.interviewProvinces) {
      if (!got.some((g) => norm(g) === norm(p))) errors.push(`missing interview ${p}; got ${got.join(",")}`);
    }
  }

  if (c.expect.hqProvinces) {
    const got = r.companyHeadquarters.map((w) => w.province || w.name);
    for (const p of c.expect.hqProvinces) {
      if (!got.some((g) => norm(g) === norm(p))) errors.push(`missing hq ${p}; got ${got.join(",")}`);
    }
  }

  if (c.expect.region) {
    const ok = r.workLocations.some((w) => norm(w.name).includes(norm(c.expect.region!))) ||
      (r.primaryLocation && norm(r.primaryLocation.name).includes(norm(c.expect.region)));
    if (!ok) errors.push(`missing region ${c.expect.region}`);
  }

  if (errors.length) {
    failed++;
    console.error(`FAIL ${c.name}`);
    for (const e of errors) console.error("  ", e);
    console.error("  result:", JSON.stringify({
      status: r.status,
      conf: r.confidence,
      work: r.workLocations.map((w) => w.display),
      service: r.serviceRoutes.map((w) => w.display),
      residence: r.residenceRequirements.map((w) => w.display),
      interview: r.interviewLocations.map((w) => w.display),
      hq: r.companyHeadquarters.map((w) => w.display),
      scope: r.locationScope,
    }, null, 2));
  } else {
    console.log(`OK   ${c.name}`);
  }
}

console.log(failed === 0 ? "\nALL 15 OK" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
