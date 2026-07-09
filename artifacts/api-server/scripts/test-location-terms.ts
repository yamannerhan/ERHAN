import { extractLocation } from "../src/lib/job-parsing.ts";
import { textMatchesProvince } from "../src/lib/location-terms.ts";

const cases: [string, string, boolean][] = [
  ["YENİBOSNA OTEL OGG", "İstanbul", true],
  ["GOSB fabrika güvenlik", "Kocaeli", true],
  ["OSTİM ASELSAN", "Ankara", true],
  ["Vestel City temizlik", "Manisa", true],
  ["PETKİM aliağa", "İzmir", true],
  ["Antalya otel", "İstanbul", false],
];

let failed = 0;
for (const [text, province, expected] of cases) {
  const loc = extractLocation(text);
  const match = textMatchesProvince(text, province);
  if (match !== expected) {
    console.error("FAIL", text, province, match, loc);
    failed++;
  }
}
console.log(failed === 0 ? "ALL OK" : `${failed} failures`);
process.exit(failed === 0 ? 0 : 1);
