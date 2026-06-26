// Türkçe küfür / argo filtresi
// Mesaj DB'ye kaydedilmeden önce uygulanır — sansürlü hâli saklanır.

const PROFANITY_LIST: string[] = [
  // Temel küfürler ve varyasyonlar
  "orospu",
  "orospuçocuğu",
  "orosbuçocuğu",
  "göt",
  "goot",
  "g0t",
  "götlü",
  "götveren",
  "götoğlanı",
  "amk",
  "amına",
  "amını",
  "amcık",
  "amına koyayım",
  "amına koyim",
  "bok",
  "boktan",
  "boklu",
  "sik",
  "sikmek",
  "sikiş",
  "sikik",
  "sikiyim",
  "sikeyim",
  "sikerim",
  "siktir",
  "siktir git",
  "siktirgit",
  "sikilmiş",
  "sikişmek",
  "piç",
  "piçlik",
  "piçkurusu",
  "oğlan",
  "ibne",
  "ibnelik",
  "götveren",
  "salak",
  "aptal",
  "gerizekalı",
  "geri zekalı",
  "mal",
  "dangalak",
  "ahmak",
  "eşek",
  "eşşek",
  "serseri",
  "puşt",
  "puştluk",
  "lavuk",
  "toprak",
  "haysiyetsiz",
  "orspu",
  "kahpe",
  "kahpelik",
  "kaltak",
  "sürtük",
  "fahişe",
  "bok yemek",
  "bokyedi",
  "oç",
  "pezevenk",
  "pezevenklik",
  "dölü",
  "döl",
  "göbeğine",
  "kancık",
  "şerefsiz",
  "şerefsizlik",
  "namussuz",
  "namussuzluk",
  "aşağılık",
  "hıyar",
  "yarrak",
  "yarak",
  "taşak",
  "taşşak",
  "hassiktir",
  "haysız",
  "boku",
  "bok gibi",
  "bok kadar",
  "boktan",
  "orospu çocuğu",
  "orospu cocu",
  "orsp",
];

// Türkçe karakter normalize (küçük harf + i/ı uyumu)
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/Ğ/g, "ğ")
    .replace(/Ş/g, "ş")
    .replace(/Ç/g, "ç")
    .replace(/Ü/g, "ü")
    .replace(/Ö/g, "ö")
    // Leet-speak yaklaşımı
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/1/g, "i")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function censor(word: string): string {
  if (word.length <= 2) return "*".repeat(word.length);
  return word[0] + "*".repeat(word.length - 2) + word[word.length - 1];
}

// Kelimenin bulunduğu yeri sansürle, büyük/küçük harf ve Türkçe karaktere duyarsız
export function filterProfanity(text: string): string {
  let result = text;

  for (const bad of PROFANITY_LIST) {
    // Boşluklu ifadeler için basit substring araması
    const normBad = normalize(bad);
    const normResult = normalize(result);

    let searchFrom = 0;
    while (true) {
      const idx = normResult.indexOf(normBad, searchFrom);
      if (idx === -1) break;

      // Sözcük sınırı kontrolü — hem boşlukla hem de metin başı/sonu
      const before = idx > 0 ? normResult[idx - 1]! : " ";
      const after = idx + normBad.length < normResult.length ? normResult[idx + normBad.length]! : " ";
      const isBoundaryBefore = /[\s,!?.;:()\-"'']/.test(before) || idx === 0;
      const isBoundaryAfter = /[\s,!?.;:()\-"'']/.test(after) || idx + normBad.length === normResult.length;

      if (isBoundaryBefore || isBoundaryAfter || normBad.length >= 4) {
        const original = result.slice(idx, idx + bad.length);
        const censored = censor(original);
        result = result.slice(0, idx) + censored + result.slice(idx + bad.length);
        // normResult güncellenmez, ama result değişti — idx aynı kaldığı için devam edebiliriz
        searchFrom = idx + censored.length;
      } else {
        searchFrom = idx + 1;
      }
    }
  }

  return result;
}
