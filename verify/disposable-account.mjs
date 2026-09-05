// Read-only by default. Deletion requires both the exact generated email and UUID.
// The DB password stays in memory and is passed to psql through its environment.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const cfg = parseEnv(readFileSync(resolve(root, ".env.local"), "utf8"));
const ref = new URL(cfg.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const emailPattern = /^verify-reshot-edits-[0-9a-f-]{36}@tensets\.fit$/;

function query(sql, email, id) {
  if (ref !== "jjtadoncmpbzfuwqbmgs")
    throw new Error("Unexpected Supabase project; refusing account operation");
  if (!emailPattern.test(email))
    throw new Error("Expected a unique reshot verification email");
  if (id && !uuidPattern.test(id))
    throw new Error("Expected exact test account UUID");
  const result = spawnSync(
    process.env.PSQL_PATH ?? "/opt/homebrew/opt/libpq/bin/psql",
    [
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `test_email=${email}`,
      ...(id ? ["-v", `test_id=${id}`] : []),
    ],
    {
      input: sql,
      env: {
        ...process.env,
        PGHOST: `db.${ref}.supabase.co`,
        PGPORT: "5432",
        PGDATABASE: "postgres",
        PGUSER: "postgres",
        PGPASSWORD: cfg.SUPABASE_DB_PASSWORD,
        PGSSLMODE: "require",
        PGCONNECT_TIMEOUT: "8",
      },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Verification database query failed: ${result.stderr.trim() || result.error?.message}`,
    );
  return result.stdout.trim();
}

export function inspectDisposable(email) {
  const result = query(
    `SELECT json_build_object('id', id, 'email', email, 'created_at', created_at) FROM auth.users WHERE email = :'test_email';`,
    email,
  );
  return result ? JSON.parse(result) : null;
}

export function readDisposableStates(email, id) {
  const result = query(
    `SELECT coalesce(json_object_agg(s.kind, s.data), '{}'::json) FROM public.tracker_state s JOIN auth.users u ON u.id = s.user_id WHERE u.id = :'test_id'::uuid AND u.email = :'test_email';`,
    email,
    id,
  );
  return JSON.parse(result);
}

export function deleteDisposable(email, id) {
  const account = inspectDisposable(email);
  if (!account) return { deleted: false, alreadyAbsent: true };
  if (account.id !== id)
    throw new Error("Test account UUID/email mismatch; refusing deletion");
  if (Date.now() - Date.parse(account.created_at) > 48 * 60 * 60 * 1000)
    throw new Error(
      "Test account is older than 48 hours; refusing automatic deletion",
    );
  const deleted = query(
    `DELETE FROM auth.users WHERE id = :'test_id'::uuid AND email = :'test_email' RETURNING id;`,
    email,
    id,
  );
  if (deleted !== id)
    throw new Error("Expected exactly one test account deletion");
  if (inspectDisposable(email))
    throw new Error("Test account still exists after deletion");
  const rows = query(
    `SELECT count(*) FROM public.tracker_state WHERE user_id = :'test_id'::uuid;`,
    email,
    id,
  );
  if (rows !== "0")
    throw new Error("Disposable tracker rows remain after account deletion");
  return { deleted: true, remainingTrackerRows: 0 };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const argument = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  const email = process.argv.includes("--email") ? argument("--email") : "";
  if (process.argv.includes("--delete")) {
    if (!process.argv.includes("--id"))
      throw new Error("Deletion requires --id and --email");
    console.log(JSON.stringify(deleteDisposable(email, argument("--id"))));
  } else {
    console.log(
      JSON.stringify({ mode: "read-only", account: inspectDisposable(email) }),
    );
  }
}
