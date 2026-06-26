import { db, bannersTable, listingsTable, chatMessagesTable, announcementsTable, adminSettingsTable } from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";

const demoListings = [
  {
    title: "AVM Özel Güvenlik Görevlisi",
    company: "Marmara Güvenlik A.Ş.",
    city: "İstanbul",
    salary: "32.000 - 38.000 TL",
    salaryMin: 32000,
    salaryMax: 38000,
    workType: "Tam Zamanlı",
    description: "İstanbul Avrupa Yakası AVM projemizde 2+2 vardiya sisteminde çalışacak silahlı/silahsız güvenlik personeli aranmaktadır.",
    requirements: "ÖGG kimlik kartı aktif, vardiyalı çalışabilecek, iletişimi güçlü adaylar.",
    companyLogoUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=900&q=80&fit=crop",
    isFeatured: true,
  },
  {
    title: "Site Güvenlik Personeli",
    company: "Prestij Site Yönetimi",
    city: "Ankara",
    salary: "30.000 - 35.000 TL",
    salaryMin: 30000,
    salaryMax: 35000,
    workType: "Tam Zamanlı",
    description: "Çankaya bölgesinde lüks konut projesinde danışma ve devriye görevinde çalışacak personel alınacaktır.",
    requirements: "Diksiyonu düzgün, kamera sistemi kullanabilen, tercihen deneyimli.",
    companyLogoUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=900&q=80&fit=crop",
    isFeatured: true,
  },
  {
    title: "Hastane Güvenlik Görevlisi",
    company: "Sağlık Güvenlik Hizmetleri",
    city: "İzmir",
    salary: "34.000 - 42.000 TL",
    salaryMin: 34000,
    salaryMax: 42000,
    workType: "Tam Zamanlı",
    description: "Hastane giriş kontrol, yönlendirme ve devriye görevlerinde çalışacak güvenlik personeli arıyoruz.",
    requirements: "ÖGG kartı aktif, insan ilişkilerinde başarılı, vardiyalı çalışabilecek.",
    companyLogoUrl: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=900&q=80&fit=crop",
    isFeatured: false,
  },
  {
    title: "Fabrika Güvenliği",
    company: "Endüstri Koruma",
    city: "Bursa",
    salary: "31.000 - 39.000 TL",
    salaryMin: 31000,
    salaryMax: 39000,
    workType: "Tam Zamanlı",
    description: "Organize sanayi bölgesinde fabrika giriş-çıkış kontrolü ve devriye görevi.",
    requirements: "Erkek adaylar için askerlik tamamlanmış, vardiyalı çalışmaya uygun.",
    companyLogoUrl: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80&fit=crop",
    isFeatured: false,
  },
];

const demoMessages = [
  { userId: -999, content: "🔎 Bunu biliyor muydunuz?\n\n5188 sayılı kanuna göre özel güvenlik görevlileri yetkilerini yalnızca görev alanı ve görev süresi içinde kullanabilir." },
  { userId: 0, content: "Güvenlik sektöründe güncel ilanlar için İlanlar sayfasını düzenli kontrol edin." },
  { userId: -1, content: "Bugün AVM güvenliği için güzel bir ilan gördüm, maaş aralığı iyi duruyor." },
  { userId: -2, content: "@mehmet_k Ben de site güvenliği ilanlarına bakıyorum. Vardiya sistemi önemli." },
  { userId: -3, content: "Hastane güvenliği biraz yoğun ama maaşlar daha iyi olabiliyor." },
  { userId: -4, content: "İstanbul dışı ilanlar da artmış, Ankara ve İzmir seçenekleri çoğalıyor." },
  { userId: -5, content: "Part time çalışma arayanlar Part Time bölümünü de kontrol edebilir." },
  { userId: -6, content: "Yeni başlayan arkadaşlara tavsiyem, mutlaka ÖGG kart süresini takip edin." },
  { userId: 0, content: "Profilinizi güncel tutmanız işverenlerin sizi daha kolay bulmasını sağlar." },
  { userId: -999, content: "🔎 Bunu biliyor muydunuz?\n\nHaftalık 45 saati aşan çalışmalar fazla mesai kapsamındadır." },
  { userId: -7, content: "Gece vardiyası zor ama alışınca düzen oturuyor. En önemlisi ekip iyi olsun." },
  { userId: -8, content: "@ibrahim_s kesinlikle ekip önemli. Bir de görev yeri net olmalı." },
  { userId: -9, content: "Fabrika güvenliği ilanlarında servis ve yemek olması büyük avantaj." },
  { userId: -10, content: "Ben site güvenliği düşünüyorum, daha sakin oluyor diyorlar." },
  { userId: -11, content: "Silahlı kartı olanlara maaşlar biraz daha iyi görünüyor." },
  { userId: 0, content: "GüvenlikBot: İlanlara başvurmadan önce çalışma saati, maaş, servis ve yemek bilgisini mutlaka kontrol edin." },
  { userId: -12, content: "Bugün iki ilana başvurdum, dönüş bekliyorum. Umarım olur." },
  { userId: -13, content: "@hacer_o hayırlısı olsun. Mülakatta ÖGG kart süresini soruyorlar genelde." },
  { userId: -14, content: "Sohbet güzel olmuş, herkes tecrübesini paylaşırsa yeni başlayanlara faydalı olur." },
  { userId: -999, content: "🔎 Bunu biliyor muydunuz?\n\nÖzel güvenlik görevlileri kaba kuvvet kullanamaz; müdahalede orantılılık ilkesi esastır." },
  { userId: -15, content: "AVM güvenliğinde insan ilişkileri çok önemli. Sabırlı olmak gerekiyor." },
  { userId: -16, content: "@cengiz_t doğru, diksiyon ve sakin kalmak işi çok kolaylaştırıyor." },
  { userId: -17, content: "Yeni ilanlar eklenince bildirim gelmesi iyi olurdu." },
  { userId: 0, content: "GüvenlikBot: Yeni ilanları kaçırmamak için İlanlar bölümünü düzenli takip edin." },
  { userId: -18, content: "ÖGG kart süresi yaklaşanlar yenileme eğitimini son güne bırakmasın." },
  { userId: -19, content: "@derya_m doğru söylüyorsun, kart süresi kaçınca iş başvurusu sıkıntı oluyor." },
  { userId: -20, content: "Sitedeki ilanların şehir filtreleri iyi olmuş, aramak kolaylaşıyor." },
  { userId: 0, content: "GüvenlikBot: Sohbette saygılı ve seviyeli iletişim kurmayı unutmayın." },
];

async function seedBanners() {
  const [{ total }] = await db.select({ total: count() }).from(bannersTable);
  if (Number(total) > 0) return;
  await db.insert(bannersTable).values([
    { title: "Özel Güvenlik İş İlanları", imageUrl: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1400&q=80&fit=crop", linkUrl: "/ilanlar", isActive: true, sortOrder: 1 },
    { title: "Part Time Güvenlik Fırsatları", imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1400&q=80&fit=crop", linkUrl: "/part-time", isActive: true, sortOrder: 2 },
  ]);
}

async function seedListings() {
  const [{ total }] = await db.select({ total: count() }).from(listingsTable);
  if (Number(total) > 0) return;
  await db.insert(listingsTable).values(demoListings.map((listing) => ({ ...listing, status: "active", isActive: true, sourceTag: "demo" })));
}

async function seedAnnouncements() {
  const [{ total }] = await db.select({ total: count() }).from(announcementsTable);
  if (Number(total) > 0) return;
  await db.insert(announcementsTable).values([
    { content: "ÖzelGüvenlik.Online yayında! Güncel ilanları ve sohbeti takip edin.", isActive: true },
    { content: "Admin panelinden ilan, banner ve sohbet ayarlarını yönetebilirsiniz.", isActive: true },
  ]);
}

async function seedSettings() {
  const [{ total }] = await db.select({ total: count() }).from(adminSettingsTable);
  if (Number(total) > 0) {
    await db.update(adminSettingsTable).set({ fakeOnlineMin: 8, fakeOnlineMax: 32, fakeOnlineBonus: 12, chatLocked: false }).where(eq(adminSettingsTable.id, 1));
    return;
  }
  await db.insert(adminSettingsTable).values({
    chatLocked: false,
    fakeOnlineBonus: 12,
    fakeOnlineMin: 8,
    fakeOnlineMax: 32,
    welcomeMessage: "ÖzelGüvenlik.Online sohbetine hoş geldiniz.",
    spamCooldown: 3,
    chatAnnounceListings: true,
  });
}

async function seedChat() {
  const [{ total }] = await db
    .select({ total: count() })
    .from(chatMessagesTable)
    .where(sql`${chatMessagesTable.userId} <= 0`);

  if (Number(total) >= demoMessages.length) return;

  await db.insert(chatMessagesTable).values(demoMessages.map((message, index) => ({
    ...message,
    isPinned: false,
    isDeleted: false,
    createdAt: new Date(Date.now() - (demoMessages.length - index) * 60_000),
  })));
}

async function main() {
  await seedSettings();
  await seedBanners();
  await seedListings();
  await seedAnnouncements();
  await seedChat();
  console.log("Demo content seeded");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});