# Home network: open connections close when you switch it off

Built on the branch `egress-close-tunnels-on-tighten` on 2026-11-14, from origin/main 5b96410, for the maintainer's decision of that evening ([ROADMAP.md](../ROADMAP.md), "Home network: open connections close when you switch it off"). Not merged, not run on a real stack. This file does not edit the roadmap.

Tags: **[code: path:line]** read on origin/main 5b96410 (code paths start at `openbot/`). **[measured]** run on this machine with the real filter, over real sockets or in a real Chromium. The filter is the computer's own network proxy ([M1_PLAN.md](../M1_PLAN.md), D36).

## 1. What the person gets

- You switch "Home and office network access" off, turn "Cloud network access" off, or take a rule out of a network list. Every connection the old setting allowed and the new one would refuse is closed at once, not only refused the next time. A page, a download or a command sees the connection drop.
- A setting that becomes wider closes nothing.
- Cloud metadata and link-local addresses were never open, with the switch on or off. They are still refused before any connection exists.

## 2. What was measured before the change

| Case | On main | Where |
|---|---|---|
| A tunnel (CONNECT) opened to a home-network address with the switch on | Kept carrying data after the switch went off. Only a new CONNECT got 403. A page's WebSocket to a service on the computer kept echoing in a real Chromium [measured] | The two sockets are piped and the policy is never read again [code: agent-computer/src/egress.ts:969-1008, the pipes at 999-1000]. `setEgressPolicy` only stores the policy [code: egress.ts:611] |
| A plain-HTTP response that was still streaming | Kept streaming after the switch went off [measured] | Judged once, when the request arrived [code: egress.ts:966] |
| A later plain-HTTP request to the same name and port | Could leave on a keep-alive socket opened for an earlier request, so to an address that the policy of that moment refuses [measured: a name moved from one address to another, the policy allowed only the new one, the request still reached the old one] | `httpRequest` without its own agent pools by name and port under Bun [code: egress.ts:1063] |
| A policy that arrived while a name was being looked up | The connection was judged by the policy in force when the lookup started: a switch turned off during the lookup still let a tunnel and a plain request through (200 on both) [measured, with a lookup held open] | `decide` reads the policy before the lookup and judges with it after [code: egress.ts:660, 678, 684-687] |
| Stopping the filter | Waited for every open tunnel to end of its own accord [measured] | [code: egress.ts:1023-1030] |

So plain HTTP was not entirely "judged per request and fine": the streaming response, the pooled socket and the lookup window above are holes of the same kind, and are closed here.

## 3. Built so far

### 3.1 What it does

- The filter keeps what it carries: every tunnel, and every plain request until its answer has been delivered. For each it keeps who it was judged as, the host and port as asked, and the address it really goes to.
- Every change to a policy (`setEgressPolicy`, which the server's push calls) judges all of it again, before the call returns, with `judge`, the function a new connection meets (`decide` uses it too). Both sides of a connection that would now be refused are destroyed. Nothing is slept on or retried.
- The address a direct tunnel is judged by is the one its socket reached, not looked up again. While a tunnel is still being set up it is every address that was checked, since any of them may be the one.
- A wider policy, or the same one pushed again, ends nothing. This follows from the rule: a connection is ended only when the same function, given the same inputs, now says no.
- A connection is judged once more, by the policies in force at that moment, just before it is carried: a policy pushed while the name was being looked up is not missed.
- A connection still being set up when the policy arrives is judged too. Its client is refused with the reason a new CONNECT would get, and the socket being made is destroyed the moment it exists, with nothing sent through it.
- A request leaves on a connection of its own (`agent: false`), which ends with it. That closes the pooling hole in section 2.
- `stopEgressFilter` ends everything it carries. Before, it waited for the tunnels.

### 3.2 Whose policy a connection is judged by

- A connection that carried a Bot in its proxy credentials is judged by that Bot's policy only. Taking that policy away ends what it carried, as a new connection would be refused until one arrives.
- **A connection with no Bot in its credentials cannot be attributed to a Bot.** That is every browser connection: Chromium sends proxy credentials only when answering a 407, which the filter never sends [measured]. It is judged exactly as a new connection of its kind is: by the only policy on the computer, or by every policy at once with the strictest winning.
- So it errs on the strict side only. An unattributed tunnel is ended as soon as any policy on the computer refuses it, and the person's next attempt from that Bot meets the same rule and is refused too. It is never kept where a new connection would be refused. What it can cost is a connection ended a moment before the person would have seen it refused, on a computer that serves several Bots.

### 3.3 Files

- Changed: `agent-computer/src/egress.ts`; `agent-computer/tests/private-network-browser.test.ts` (one case); `server/src/computer/policy-network.ts` (one sentence of a comment); `openbot/docs/configuration.md`; `docs/UPSTREAM_TOUCHES.md` (rows).
- New: `agent-computer/tests/egress-tighten.test.ts`; this file.
- Not changed: `SECURITY.md` (no sentence became false), `ROADMAP.md`, `M1_PLAN.md`, `README.md`.

### 3.4 Tests and checks

| What | Result |
|---|---|
| `egress-tighten.test.ts` (30 tests, real sockets, a fake upstream that echoes, bounded waits on close events, no sleeps) | 30 pass on the branch in every run (the 26 first written passed in nine runs of the file alone, six on Bun 1.4.4 and three on Bun 1.4.3, the version CI pins; the last four were added after those runs and passed in every run since, all on Bun 1.4.4). On main's `egress.ts`: 1 pass, 29 fail. The pass is a guard, labelled in its title (nothing is closed on main either). 5 of the 29 fail on main only because the counter they read does not exist; 24 fail on behaviour |
| `private-network-browser.test.ts`, real Chromium, one new case (a page's WebSocket opened with the switch on, switch turned off) | 4 pass on the branch (Bun 1.4.4 and 1.4.3), and the new case alone passed 6 runs in 6. On main's `egress.ts` the new case fails (the page's socket does not close within 10 s) and the other three pass |
| The CI list `computer (real browser)`, ten files in one process | 44 pass, 0 fail |
| The whole `agent-computer` suite | 659 pass, 74 skip, 2 fail. The two are the IPv6 cases that cannot listen on `::1` here (`EAFNOSUPPORT`); they fail the same way on main |
| `biome format` and `biome lint` over `openbot/`, `tsc --noEmit` in `agent-computer` and in `server`, `bun run typecheck:tests`, `server/tests/assertion-shape.test.ts` | All clean. `typecheck:tests` is clean against its baseline (239 known errors) on its second run (see section 3.5). Assertion-shape: 10 pass |

The tests cover: the switch off, `allow_all` to `deny_all`, an allowlist rule removed (and only that tunnel closes), a name judged by the address it reached, a Bot with credentials and one without, a Bot's policy taken away, `EGRESS_POLICY_REQUIRED=0`, tunnels behind an upstream proxy, a tunnel being set up when the policy arrives, forty tunnels at once, a tunnel closing at either end when the policy arrives, tighten then widen, a streaming response, the pooling hole, a policy arriving during a name lookup (tunnel and plain request), a name with two addresses judged by the one the tunnel reached, and the filter's own count of what it carries.

The code was also broken on purpose in fifteen ways, each run against these tests. Twelve were caught (among them: the policy change not ending anything, anonymous connections skipped, the far side or a late socket left open, the judging before a connection is carried removed, the stop not ending connections, a plain request not let go of when its client had already gone, `agent: false` removed). Three were not, because the code they break is redundant under Bun: a plain request's explicit `outbound.destroy()` (the response's close does it too), a tunnel's explicit `client.destroy()` (Bun closes the client when the far side is destroyed), and releasing a tunnel when only its client has closed (under Bun both ends close together, so no half-open state could be built to show it).

### 3.5 Not verified

- The time from the click in the app to the push on the computer. The filter ends connections in the same turn as the push arrives; the push itself is on a change announcement or at most every 30 seconds ([code: server/src/admin/controls.ts:590], [code: server/src/computer/policy-network.ts:15-17]), and it was not measured here.
- No real computer, no Docker stack and no HTTPS page were used. The sockets, the fake upstream and the browser ran on this machine.
- A tunnel behind an upstream proxy (`EGRESS_PROXY_*`): the filter cannot know where the proxy took it, so it judges what it knows: an address written out, or a name by its domain rules and by the addresses it resolved when the policy of the time needed them. A policy that decides by range, arriving for a name that was never resolved, ends the tunnel. That errs on the strict side. Tested with a fake proxy only.
- The two IPv6 plain-HTTP cases cannot run here, so IPv6 plain requests with `agent: false` have no test on this machine. The change does not touch how an address is passed to the socket.
- `EGRESS_POLICY_REQUIRED` is read when the filter starts, not on a push. Changing it on a running filter does not re-judge what is open. Nothing in the product changes it while running.
- A raw socket that ignores the proxy variables never reaches the filter, so nothing here stops it ([SECURITY.md](../../SECURITY.md)).
- The whole-suite and the ten-file browser runs were on Bun 1.4.4 (this machine). CI pins 1.4.3, where only the socket file and the browser file were run.
- `bun run typecheck:tests` was killed once on this machine (SIGKILL, other work was using the memory). That run is not a result; the second run, on a quieter machine, is the one reported.

### 3.6 Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| A connection still being set up when the policy arrives | (a) as built: its client is refused at once, the socket being made is destroyed when it exists; (b) also abort the connect itself | (a) | The connect is short and bounded, nothing is sent through it, and (b) means changing how a tunnel is made |
| Browser and shell connections cannot be attributed to a Bot | (a) as built: judged by every policy, strictest wins, as a new connection of its kind is; (b) give each Bot its own proxy credentials or port so only its own tunnels end | (a) now; (b) belongs with the separate token for each member's computer | (a) never keeps a connection a new one would be refused, and costs a reconnect on a computer that serves several Bots. (b) is a change to how every browser and shell reaches the filter |
| A plain request now uses a connection of its own | (a) as built; (b) keep pooling and check the pooled socket's address before each reuse | (a) | It closes a real hole with one option. Plain HTTP is rare and its cost is one connect per request on the computer's own network. (b) is more code and depends on how Bun pools |
| Connections end abruptly | (a) as built: both sockets destroyed, so a page sees an abnormal close (a WebSocket reports code 1006) and a download stops; (b) a graceful close | (a) | The policy says refuse. A graceful close lets the far end keep sending for as long as it likes |
| Telling the person | (a) as built: nothing is shown or logged; (b) a log line with a count; (c) a notice in the app | (a) for now, (b) if people ask why a download stopped | A count carries no address, so it is safe to log. A notice needs the app and the person's wording |
