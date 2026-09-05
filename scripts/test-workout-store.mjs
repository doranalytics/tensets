import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Use the project's existing TypeScript compiler and Node's built-in test
// runner. Compile into a unique temporary directory and leave no artifacts.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(join(tmpdir(), "tensets-workout-tests-"));
try {
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "tests/workout-store.test.ts",
      "app/workout-store.ts",
      "app/muscles.ts",
      "--outDir",
      output,
      "--target",
      "es2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: root, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    ["--test", join(output, "tests/workout-store.test.js")],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
} finally {
  rmSync(output, { recursive: true, force: true });
}
