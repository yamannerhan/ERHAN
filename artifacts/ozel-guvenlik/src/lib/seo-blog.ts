export interface SeoBlogPost {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  content: string;
}

export const SEO_BLOG_CATEGORIES = [
  "İş Arama Rehberi",
  "Maaş ve Haklar",
  "Sektör Haberleri",
  "Eğitim ve Sertifika",
] as const;

export const SEO_BLOG_POSTS: SeoBlogPost[] = [
  {
    slug: "ozel-guvenlik-is-ilanlari-nasil-bulunur",
    title: "Özel Güvenlik İş İlanları Nasıl Bulunur? 2026 Rehberi",
    category: "İş Arama Rehberi",
    publishedAt: "2026-01-15",
    description: "Özel güvenlik iş ilanlarına nasıl ulaşılır, hangi platformlar güvenilirdir ve başvuru sürecinde nelere dikkat edilmelidir? Kapsamlı rehber.",
    content: `Özel güvenlik sektörü Türkiye'de istihdam açısından en dinamik alanlardan biridir. Özel Güvenlik Kimlik Kartı sahibi adaylar için silahlı ve silahsız pozisyonlarda sürekli personel alımı yapılmaktadır. Bu rehberde özel güvenlik iş ilanlarına en hızlı nasıl ulaşacağınızı anlatıyoruz.

Güncel ilanları takip etmek için güvenilir platformları tercih edin. ozelguvenlik.online gibi sektöre özel ilan siteleri, Telegram gruplarından toplanan ilanları düzenli şekilde yayınlar. İlanları şehir, maaş ve pozisyon tipine göre filtreleyerek size uygun işleri hızlıca bulabilirsiniz.

Başvuru öncesi özel güvenlik kimlik kartınızın geçerli olduğundan, sabıka kaydınızın temiz olduğundan ve askerlik durumunuzun (erkek adaylar için) net olduğundan emin olun. CV'nizi güncel tutun; ücretsiz dijital CV araçları başvuru sürecini kolaylaştırır.

İstanbul, Kocaeli, Ankara ve İzmir en yoğun ilan yayınlanan bölgelerdir. OSB ve fabrika güvenliği Kocaeli-Gebze hattında; AVM güvenliği İstanbul'da özellikle yoğundur. Bölgenize özel ilanları filtreleyerek başvuru yapın.`,
  },
  {
    slug: "silahli-silahsiz-guvenlik-maaslari",
    title: "Silahlı ve Silahsız Güvenlik Maaşları 2026",
    category: "Maaş ve Haklar",
    publishedAt: "2026-02-01",
    description: "2026 yılında silahlı ve silahsız özel güvenlik görevlisi maaşları, yan haklar ve bölgesel farklılıklar hakkında güncel bilgiler.",
    content: `Özel güvenlik maaşları çalışılan şehir, tesis tipi (AVM, fabrika, site, hastane) ve silahlı/silahsız statüye göre değişir. Silahsız güvenlik görevlisi pozisyonlarında genellikle asgari ücret üzerine yemek, yol ve servis imkânları sunulur.

Silahlı güvenlik görevlisi maaşları silahsız pozisyonlara kıyasla daha yüksektir. Kimlikli silahlı çalışanlar için aylık net ücret bölgeye göre 35.000 TL ile 60.000 TL arasında değişebilir. OSB ve fabrika güvenliğinde vardiya primleri eklenir.

Yemek kartı, servis, SGK, yıllık izin ve kıdem tazminatı haklarınızı ilan metninde mutlaka kontrol edin. Toplam paket değerini hesaplayarak karşılaştırma yapın.`,
  },
  {
    slug: "ozel-guvenlik-kimlik-karti-nasil-alinir",
    title: "Özel Güvenlik Kimlik Kartı Nasıl Alınır?",
    category: "Eğitim ve Sertifika",
    publishedAt: "2026-02-10",
    description: "ÖGG ve silahlı özel güvenlik kimlik kartı alma şartları, eğitim süreci ve başvuru adımları.",
    content: `Özel güvenlik sektöründe çalışmak için 5188 sayılı kanun kapsamında özel güvenlik kimlik kartı zorunludur. Silahsız kimlik için temel eğitim, silahlı kimlik için ek silah eğitimi tamamlanmalıdır.

Eğitimleri Emniyet Genel Müdürlüğü onaylı kurumlarda alabilirsiniz. Eğitim sonrası sınav ve sağlık raporu ile başvuru yapılır. Kimlik kartı olmadan güvenlik görevinde çalışmak yasaktır.

İş ararken kimlik türünüze uygun ilanlara başvurun: silahlı ilanlar için silahlı kimlik, silahsız ilanlar için silahsız kimlik gereklidir.`,
  },
  {
    slug: "istanbul-ozel-guvenlik-is-ilanlari-rehberi",
    title: "İstanbul Özel Güvenlik İş İlanları Rehberi",
    category: "İş Arama Rehberi",
    publishedAt: "2026-03-01",
    description: "İstanbul Anadolu ve Avrupa Yakası özel güvenlik iş ilanları, bölgesel farklar ve başvuru ipuçları.",
    content: `İstanbul, Türkiye'nin en fazla özel güvenlik personeline ihtiyaç duyan şehridir. Anadolu Yakası'nda Ataşehir, Ümraniye, Kadıköy ve Pendik; Avrupa Yakası'nda Esenyurt, Beylikdüzü, Başakşehir ve Şişli yoğun ilan bölgeleridir.

AVM güvenliği, plaza güvenliği, site güvenliği ve hastane güvenliği İstanbul'da en çok aranan pozisyonlardır. Vardiya düzenleri genellikle 2/2 veya 4/2 sistemindedir.

İstanbul özel güvenlik iş ilanlarına başvururken ulaşım ve servis imkânlarını mutlaka sorun. Şehir içi uzun mesafe işe gidiş-geliş maliyetini hesaba katın.`,
  },
  {
    slug: "kocaeli-gebze-guvenlik-is-ilanlari",
    title: "Kocaeli ve Gebze Güvenlik İş İlanları",
    category: "Sektör Haberleri",
    publishedAt: "2026-03-05",
    description: "Kocaeli, Gebze, GOSB ve TOSB bölgesi özel güvenlik iş ilanları ve fabrika güvenliği fırsatları.",
    content: `Kocaeli ve Gebze, sanayi ve OSB güvenliği açısından Türkiye'nin en aktif bölgelerinden biridir. GOSB, TOSB, Gebkim ve Dilovası OSB'de fabrika ve lojistik güvenliği için sürekli personel alımı yapılır.

Fabrika güvenliğinde genellikle silahlı veya silahsız vardiyalı çalışma düzeni uygulanır. Maaşlar İstanbul'a kıyasla rekabetçidir; servis ve yemek imkânları yaygındır.

Gebze ve İzmit'te konutayan adaylar için ulaşım avantajı sağlar. Kocaeli özel güvenlik iş ilanlarını düzenli takip edin.`,
  },
];

const bySlug = new Map(SEO_BLOG_POSTS.map(p => [p.slug, p]));

export function getSeoBlogPost(slug: string): SeoBlogPost | null {
  return bySlug.get(slug) ?? null;
}
