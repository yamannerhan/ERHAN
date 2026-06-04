// Telegram/elle eklenen ilan metinlerinden maaş ve cinsiyet çıkarımı.
// Hem scraper (otomatik içe aktarım) hem onay/elle ekleme akışları aynı mantığı kullanır.

// Para benzeri sayı: 44.453 | 25,000 | 1.500 (binlik ayraçlı) veya 30000 (5-6 hane).
// 4 haneli ayraçsız sayılar (ör. "2024" yılı) maaş sanılmasın diye hariç tutulur.
const NUM = "(\\d{1,3}(?:[.,]\\d{3})+|\\d{5,6})";
// Para birimi
const CUR = "(?:tl|₺|try|lira)";

export function extractSalary(text: string): string | null {
  // İ/Ş/ş doğru küçülsün diye Türkçe küçük harfe çevir
  const tl = text.toLocaleLowerCase("tr-TR");

  // 1) Toplam hakediş/paket — en yüksek öncelik (net ele geçen)
  const total = tl.match(new RegExp(`toplam\\s+(?:hakedi[şs]|kazan[çc]|[üu]cret|paket)\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`));
  if (total) return `${total[1]} TL (Toplam Hakediş)`;

  // 2) "X bin" kalıbı: maaş bağlamı veya para birimiyle ("maaş 45 bin", "45 bin tl") → 45.000
  const binLabeled = tl.match(/(?:maa[şs]|[üu]cret|net|ayl[ıi]k|hakedi[şs])\D{0,12}(\d{1,3})\s*bin/);
  const binCur = tl.match(/(\d{1,3})\s*bin\s*(?:tl|₺|lira)/);
  const bin = binLabeled ?? binCur;
  if (bin) {
    const n = parseInt(bin[1]!, 10);
    if (n >= 10 && n <= 200) return `${n}.000 TL`;
  }

  // 3) Etiketli maaş — TL olmadan da kabul ("maaş 44.453 net")
  const labeled = tl.match(new RegExp(`(?:maa[şs]|[üu]cret|ayl[ıi]k|net\\s+maa[şs]|ele\\s+ge[çc]en)\\s*[:\\-]?\\s*${NUM}\\s*${CUR}?`));
  if (labeled) {
    const extras: string[] = [];
    if (/yol\b/.test(tl)) extras.push("Yol");
    if (/yemek\b/.test(tl)) extras.push("Yemek");
    const suffix = extras.length ? ` + ${extras.join(" + ")}` : "";
    return `${labeled[1]} TL${suffix}`;
  }

  // 4) Aralık "25.000 – 30.000 tl" (yanlış eşleşmeyi önlemek için para birimi zorunlu)
  const range = tl.match(new RegExp(`${NUM}\\s*[-–]\\s*${NUM}\\s*${CUR}`));
  if (range) return `${range[1]}-${range[2]} TL`;

  // 5) Genel sayı + para birimi (zorunlu)
  const generic = tl.match(new RegExp(`${NUM}\\s*${CUR}`));
  if (generic) return `${generic[1]} TL`;

  // 6) Asgari ücret
  if (/asgari\s+[üu]cret/.test(tl)) return "Asgari Ücret";

  return null;
}

// Cinsiyet algısı: bayan/kadın/hanım → Bayan; bay/erkek → Bay; ikisi de → Bay / Bayan
// Hiçbiri yoksa null döner (çağıran taraf "Belirtilmemiş" yazabilir).
export function extractGender(text: string): string | null {
  const t = text.toLocaleLowerCase("tr-TR");
  const female = /\b(?:bayan|kad[ıi]n|han[ıi]m)\b/.test(t);
  // "bay" kelimesi "bayan" içinde sayılmaz (kelime sınırı sayesinde)
  const male = /\b(?:bay|erkek)\b/.test(t);
  if (female && male) return "Bay / Bayan";
  if (female) return "Bayan";
  if (male) return "Bay";
  return null;
}
