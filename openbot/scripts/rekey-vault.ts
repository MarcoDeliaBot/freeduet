/**
 * Seals again, with a key made for this installation, what the example KEY_ENCRYPTION_KEY seals.
 *
 *   bun scripts/rekey-vault.ts --yes            check only: counts, nothing changes
 *   bun scripts/rekey-vault.ts --apply --yes    re-seal, and write the new key into .env
 *
 * Run from the `openbot` folder, by a person, on purpose, with FreeDuet stopped. Nothing starts it and
 * scripts/start.sh never runs it. What it does, step by step, and what it leaves behind:
 * docs/design/vault-rekey.md. The work is in server/src/freeduet/vault-rekey-command.ts.
 */
import { resolve } from "node:path";
import {
  Interrupted,
  runRekey,
} from "../server/src/freeduet/vault-rekey-command";

async function main(): Promise<number> {
  // Ctrl-C before the first change just stops. Once the work has begun, the first one asks it to stop
  // at the next point where that leaves nothing behind (the transaction is undone), and a second one
  // stops it where it is: the database undoes an unfinished transaction by itself.
  let working = false;
  let asked = false;
  const onSignal = () => {
    if (!working) {
      process.stderr.write("\nInterrupted. Nothing was changed.\n");
      process.exit(130);
    }
    if (asked) {
      process.stderr.write(
        "\nStopped. Run the command again to see where things stand.\n",
      );
      process.exit(130);
    }
    asked = true;
    process.stderr.write("\nStopping at the next safe point.\n");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  return await runRekey({
    argv: process.argv.slice(2),
    root: resolve(import.meta.dir, ".."),
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    checkpoint: () => {
      working = true;
      if (asked) throw new Interrupted();
    },
  });
}

if (import.meta.main) process.exit(await main());
