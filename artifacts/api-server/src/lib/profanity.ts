// Türkçe küfür / argo filtresi
// Mesaj DB'ye kaydedilmeden önce uygulanır — sansürlü hâli saklanır.

const PROFANITY_LIST: string[] = [
  "orospu",
  "orospuçocuğu",
  "orosbuçocuğu",
  "orospu çocuğu",
  "orospu cocu",
  "orspu",
  "orsp",
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
  "bok yemek",
  "bokyedi",
  "bok gibi",
  "bok kadar",
  "boku",
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
  "hassiktir",
  "piç",
  "piçlik",
  "piçkurusu",
  "ibne",
  "ibnelik",
  "salak",
  "aptal",
  "gerizekalı",
  "geri zekalı",
  "dangalak",
  "ahmak",
  "serseri",
  "puşt",
  "puştluk",
  "lavuk",
  "haysiyetsiz",
  "haysız",
  "kahpe",
  "kahpelik",
  "kaltak",
  "sürtük",
  "fahişe",
  "oç",
  "pezevenk",
  "pezevenklik",
  "kancık",
  "şerefsiz",
  "şerefsizlik",
  "namussuz",
  "namussuzluk",
  "aşağılık",
  "yarrak",
  "yarak",
  "taşak",
  "taşşak",
];

/** Türkçe karakter + leet normalize */
export function normalizeProfanity(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/1/g, "i")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function censor(word: string): string {
  if (word.length <= 2) return "*".repeat(word.length);
  return word[0]! + "*".repeat(word.length - 2) + word[word.length - 1]!;
}

function isWordBoundary(ch: string | undefined): boolean {
  if (ch === undefined) return true;
  return /[\s,!?.;:()\-"'`´/\\|]/.test(ch);
}

/** extraWords: admin panelinden eklenen yasaklı kelimeler */
export function filterProfanity(text: string, extraWords: string[] = []): string {
  const words = [...PROFANITY_LIST, ...extraWords]
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .sort((a, b) => b.length - a.length);

  let result = text;

  for (const bad of words) {
    const normBad = normalizeProfanity(bad);
    if (!normBad) continue;

    let searchFrom = 0;
    while (true) {
      const normResult = normalizeProfanity(result);
      const idx = normResult.indexOf(normBad, searchFrom);
      if (idx === -1) break;

      // Orijinal dilimde aynı uzunluk (normalize karakter sayısı korur)
      const span = normBad.length;
      const before = idx > 0 ? normResult[idx - 1] : undefined;
      const after = idx + span < normResult.length ? normResult[idx + span] : undefined;

      // Her iki sınır da şart — "eşek" → "teşekkür" içine yanlış denk gelmesin
      if (isWordBoundary(before) && isWordBoundary(after)) {
        const original = result.slice(idx, idx + span);
        const censored = censor(original);
        result = result.slice(0, idx) + censored + result.slice(idx + span);
        searchFrom = idx + censored.length;
      } else {
        searchFrom = idx + 1;
      }
    }
  }

  return result;
}

export function containsProfanity(text: string, extraWords: string[] = []): boolean {
  return filterProfanity(text, extraWords) !== text;
}
