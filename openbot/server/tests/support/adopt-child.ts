// server/tests/support/adopt-child.ts
//
// The adoption command in a process of its own, that stops INSIDE its transaction, at a step it is
// told, so that a test can kill it there. It is spawned by single-user-adoption-apply.test.ts and is
// not a test.
//
// It runs the real `run()` against the database in the environment, with the backup stood in for (the
// backup is not what this is about) and a checkpoint that, at the named step, writes a marker file and
// then waits for ever. Everything else is the code the person runs.
//
// usage: bun adopt-child.ts <step> <marker file> <arguments of the command...>
import { writeFileSync } from "node:fs";
import { run } from "../../src/freeduet/adopt/command";

const [, , stopAt, marker, ...argv] = process.argv;
if (!stopAt || !marker)
  throw new Error("usage: adopt-child.ts <step> <marker> ...");

const code = await run(
  argv,
  process.env,
  { out: (line) => console.log(line), err: (line) => console.error(line) },
  {
    settleMs: 0,
    backup: async () => ({
      path: "/nowhere/child.dump",
      name: "child.dump",
      bytes: 1,
      via: "pg_dump",
    }),
    checkpoint: async (step) => {
      if (step !== stopAt) return;
      writeFileSync(marker, step);
      await new Promise(() => {});
    },
  },
);
process.exit(code);
