/**
 * @deprecated Üretimde çalıştırmayın. Yalnızca yerel geliştirme için duyuru/banner.
 * Sahte ilan eklenmez — mevcut demo ilanlar silinir.
 */
import { db, bannersTable, listingsTable, chatMessagesTable, announcementsTable, adminSettingsTable } from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";

async function purgeDemoListings() {
  const deleted = await db.delete(listingsTable).where(eq(listingsTable.sourceTag, "demo")).returning({ id: listingsTable.id });
  if (deleted.length > 0) {
    console.log(`Silinen demo ilan: ${deleted.length}`);
  }
}

async function seedBanners() {
  const [{ total }] = await db.select({ total: count() }).from(bannersTable);
  if (Number(total) > 0) return;
  await db.insert(bannersTable).values([
    { title: "Özel Güvenlik İş İlanları", imageUrl: "/banners/banner-1.jpg", linkUrl: "/ilanlar", isActive: true, sortOrder: 1 },
    { title: "Part Time Güvenlik Fırsatları", imageUrl: "/banners/banner-2.jpg", linkUrl: "/part-time", isActive: true, sortOrder: 2 },
  ]);
}

async function seedAnnouncements() {
  const [{ total }] = await db.select({ total: count() }).from(announcementsTable);
  if (Number(total) > 0) return;
  await db.insert(announcementsTable).values([
    { content: "ÖzelGüvenlik.Online yayında! Güncel ilanları ve sohbeti takip edin.", isActive: true },
  ]);
}

async function seedSettings() {
  const [{ total }] = await db.select({ total: count() }).from(adminSettingsTable);
  if (Number(total) > 0) return;
  await db.insert(adminSettingsTable).values({
    chatLocked: false,
    fakeOnlineBonus: 0,
    fakeOnlineMin: 0,
    fakeOnlineMax: 0,
    welcomeMessage: "ÖzelGüvenlik.Online sohbetine hoş geldiniz.",
    spamCooldown: 3,
    chatAnnounceListings: true,
  });
}

async function main() {
  await purgeDemoListings();
  await seedSettings();
  await seedBanners();
  await seedAnnouncements();
  console.log("Seed tamam (demo ilan yok)");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
