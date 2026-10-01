/**
 * Lists the owner-dashboard accounts, and resets one's password when asked.
 *
 * The owner account is created once, on the first boot against an empty
 * database (AccountsService.onModuleInit), and OWNER_EMAIL/OWNER_PASSWORD are
 * never read again after that — so a forgotten password has no way back
 * through the app. This is that way back, for whoever holds the database URI.
 *
 *   MONGODB_URI=... npx ts-node scripts/reset-owner-password.ts
 *       lists owner accounts, and flags any still on the dev default password
 *   MONGODB_URI=... npx ts-node scripts/reset-owner-password.ts owner@rico.app 'NewPassword!'
 *       sets that account's password
 */
import mongoose from 'mongoose';
import { hashPassword, verifyPassword } from '../src/common/utils/auth.util';

const DEV_DEFAULT_PASSWORD = 'ChangeMe123!';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const [email, password] = process.argv.slice(2);

  await mongoose.connect(uri);
  const accounts = mongoose.connection.db!.collection('accounts');

  if (!email) {
    const rows = await accounts.find({ app: 'owner' }).toArray();
    if (!rows.length) console.log('No owner account yet — the server creates one on its next boot.');
    for (const r of rows) {
      const usesDefault = typeof r.passwordHash === 'string' && verifyPassword(DEV_DEFAULT_PASSWORD, r.passwordHash);
      console.log(`${r.email}  role=${r.platformRole}  active=${r.isActive !== false}${usesDefault ? '  ⚠ still on the dev default password' : ''}`);
    }
  } else {
    if (!password || password.length < 8) throw new Error('give a new password of at least 8 characters');
    const result = await accounts.updateOne(
      { email: email.trim().toLowerCase(), app: 'owner' },
      { $set: { passwordHash: hashPassword(password), isActive: true } },
    );
    console.log(result.matchedCount ? `Password reset for ${email}.` : `No owner account with email ${email}.`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
