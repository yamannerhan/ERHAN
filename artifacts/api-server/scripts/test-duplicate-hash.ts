import {
  createDuplicateHash,
  duplicateTokenSimilarity,
  isLikelyDuplicateJob,
} from "../src/lib/job-dedup";

const base = `📢 ÖZEL GÜVENLİK GÖREVLİSİ ALIM İLANI
Beylikdüzü Marmara Park AVM arkası site projesi
2 Gündüz – 2 Gece – 2 İzin
Maaş: 45.000 TL
WhatsApp 0507 649 22 54`;

const variant = `ÖZEL GÜVENLİK GÖREVLİSİ ALIM İLANI
Görev Yeri Beylikdüzü Marmara Park AVM arkası
2 Gündüz 2 Gece 2 İzin
45.000 TL
Tel: +90 507 649 22 54`;

const different = `Pendik Kurtköy Plaza projesi Bay özel güvenlik 38.590 TL 0506 534 78 44`;

const sim = duplicateTokenSimilarity(base, variant);
const simDiff = duplicateTokenSimilarity(base, different);

if (!isLikelyDuplicateJob(base, variant)) {
  console.error("FAIL: same job not detected", { sim, hashMatch: createDuplicateHash(base) === createDuplicateHash(variant) });
  process.exit(1);
}
if (isLikelyDuplicateJob(base, different)) {
  console.error("FAIL: different jobs detected as duplicate", { simDiff });
  process.exit(1);
}
console.log("ALL OK", { sim, simDiff });
