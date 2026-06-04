import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const adminEmail = process.env.ADMIN_EMAIL || "erhanyaman001@gmail.com";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "yamann01";

async function main() {
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const [existingByEmail] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1);

  if (existingByEmail) {
    await db.update(usersTable).set({
      username: existingByEmail.username || adminUsername,
      passwordHash,
      role: "admin",
      displayName: "Admin",
      fullName: "Admin",
    }).where(eq(usersTable.id, existingByEmail.id));
    console.log(`Admin user updated: ${adminEmail}`);
    return;
  }

  const [existingByUsername] = await db.select().from(usersTable).where(eq(usersTable.username, adminUsername)).limit(1);
  if (existingByUsername) {
    await db.update(usersTable).set({
      email: adminEmail,
      passwordHash,
      role: "admin",
      displayName: "Admin",
      fullName: "Admin",
    }).where(eq(usersTable.id, existingByUsername.id));
    console.log(`Admin username updated: ${adminUsername}`);
    return;
  }

  await db.insert(usersTable).values({
    username: adminUsername,
    email: adminEmail,
    passwordHash,
    role: "admin",
    displayName: "Admin",
    fullName: "Admin",
  });
  console.log(`Admin user created: ${adminEmail}`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
