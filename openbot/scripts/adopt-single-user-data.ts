#!/usr/bin/env bun
/**
 * Moves what the person who had no sign-in owns to the account they will sign in with.
 *
 *   bun scripts/adopt-single-user-data.ts --to you@example.com
 *
 * Run from `openbot/`, by the person, with the same `.env` the server uses. It is never run by the
 * server, a route or a start-up step. With only `--to` it writes nothing. The design, the threats
 * and the way back are in docs/design/single-user-to-sign-in.md.
 */
import { main } from "../server/src/freeduet/adopt/command";

process.exit(await main(process.argv.slice(2), process.env));
