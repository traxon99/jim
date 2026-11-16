// Admin role and TOTP management (issue #806). The only way to make someone
// an admin, take it away, or clear a lost authenticator: none of these are
// in the admin UI, so a stolen admin session can't mint more admins or turn
// off TOTP. Runs on the migration role, which the users_guard_role trigger
// lets through, and records each change in admin_audit (via "script").
//
//   pnpm --filter @jim/web admin grant-admin <email>
//   pnpm --filter @jim/web admin revoke-admin <email>
//   pnpm --filter @jim/web admin clear-mfa <email>
//
// Needs MIGRATE_DATABASE_URL (or DATABASE_URL) for the production database.
import postgres from "postgres";

const COMMANDS = ["grant-admin", "revoke-admin", "clear-mfa"] as const;
type Command = (typeof COMMANDS)[number];

function usage(): never {
  console.error(`Usage: pnpm --filter @jim/web admin <${COMMANDS.join("|")}> <email>`);
  process.exit(1);
}

async function main() {
  const [command, email] = process.argv.slice(2);
  if (!COMMANDS.includes(command as Command) || !email) usage();

  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set MIGRATE_DATABASE_URL (or DATABASE_URL) to the database to change.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false, ssl: "prefer", onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      const [user] = await tx<{ id: string; role: string }[]>`
        SELECT id, role FROM users WHERE lower(email) = lower(${email})`;
      if (!user) throw new Error(`No Jim account has the email ${email}.`);

      if (command === "clear-mfa") {
        const removed =
          await tx`DELETE FROM auth.mfa_factors WHERE user_id = ${user.id} RETURNING id`;
        await tx`INSERT INTO admin_audit (target_user_id, action, old_value, new_value, via)
          VALUES (${user.id}, 'mfa.clear', ${tx.json({ factors: removed.length })}, NULL, 'script')`;
        console.log(`Cleared ${removed.length} authenticator(s) for ${email}.`);
        return;
      }

      const role = command === "grant-admin" ? "admin" : "user";
      if (user.role === role) {
        console.log(`${email} is already ${role}.`);
        return;
      }
      await tx`UPDATE users SET role = ${role} WHERE id = ${user.id}`;
      await tx`INSERT INTO admin_audit (target_user_id, action, field, old_value, new_value, via)
        VALUES (${user.id}, 'role.set', 'role', ${tx.json(user.role)}, ${tx.json(role)}, 'script')`;
      console.log(`${email}: ${user.role} → ${role}.`);
    });
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
