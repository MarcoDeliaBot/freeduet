import { serve } from "bun";
import { Hono } from "hono";
import { authorised } from "./authorisation";
import { computerMemoryBytes } from "./computer-memory-bytes";
import {
  ComputerNotAnsweringError,
  DockerUnavailableError,
  ensure,
  listOwned,
  NameHeldError,
  reachable,
  reset,
  stop,
} from "./docker";
import {
  documentsFolderIsEmpty,
  documentsSettings,
  liveDocuments,
} from "./documents";
import { environmentFor } from "./environment";
import { allowedHostsFrom, createHostGuard } from "./host-guard";
import { registerEntry } from "./identity";
import { listenPort } from "./listen-port";
import { namesFor } from "./names";

/**
 * The container supervisor: the only thing here that holds the Docker socket.
 *
 * Giving a Bot its own container requires something to create containers. Access to the Docker
 * socket is root-equivalent on the host because a container can be started with the host filesystem
 * bound into it. Putting that in the API server would mean every bug in a request handler, every
 * injection through a Bot's own output and every dependency in a large tree sits one mistake away
 * from owning the machine.
 *
 * So the socket lives behind four verbs, expressed in Bots rather than in Docker: ensure a computer
 * for this Bot, stop it, reset it, list them. There is no passthrough and no way to name a container
 * directly, names are derived from the Bot id, which is validated first. A compromised API server
 * can ask for a Bot's computer to be restarted. It cannot ask for anything else, because nothing
 * else is expressible.
 *
 * The shared secret is not the boundary; the vocabulary is. `SUPERVISOR_TOKEN` keeps other
 * processes on the same network from driving it, but even with the token the worst available action
 * is cycling a computer that already belongs to a Bot.
 *
 * Neither is the network the boundary, but it is the layer in front of both. Compose publishes this
 * port on `127.0.0.1` rather than on every address the host has, for the same reason the computer's
 * own port is bound there: a secret in an environment variable is one leak away from being known,
 * and this process holds the Docker socket. This listener stays on every interface inside its own
 * container, which is what the published mapping forwards to and what a server running inside the
 * compose network connects to as `supervisor:4300`.
 *
 * Refusing to start without it matches the computer. This process holds the Docker socket, which is
 * root on the host, so missing authentication is a deployment failure.
 */

const resolvedPort = listenPort(process.env.PORT, 4300);
if (!resolvedPort.ok) {
  console.error(resolvedPort.reason);
  process.exit(1);
}
const port = resolvedPort.port;
const token = process.env.SUPERVISOR_TOKEN?.trim();
if (!token) {
  console.error(
    "SUPERVISOR_TOKEN is not set. This process holds the Docker socket and will not start without the secret its caller must present.",
  );
  process.exit(1);
}
// Which names a caller on this machine's loopback may use (host-guard.ts, docs/M1_PLAN.md D40). A name
// this deployment points at this machine itself goes in `SUPERVISOR_ALLOWED_HOSTS`. A value that is set
// and is not a list of host names stops the boot: dropping it would show up as a caller refused with a
// 421 and nothing to say why.
const allowedHosts = allowedHostsFrom(process.env.SUPERVISOR_ALLOWED_HOSTS);
if (!allowedHosts.ok) {
  console.error(allowedHosts.reason);
  process.exit(1);
}
const hostGuard = createHostGuard(allowedHosts.hosts);
const image =
  process.env.COMPUTER_IMAGE?.trim() || "openbot-agent-computer:latest";
const network = process.env.COMPUTER_NETWORK?.trim() || undefined;
const runtime = process.env.COMPUTER_RUNTIME?.trim() || undefined;
const resolvedMemory = computerMemoryBytes(process.env.COMPUTER_MEMORY_BYTES);
if (!resolvedMemory.ok) {
  console.error(resolvedMemory.reason);
  process.exit(1);
}
const memoryBytes = resolvedMemory.bytes;
const spireSocketVolume =
  process.env.SPIRE_AGENT_SOCKET_VOLUME?.trim() || undefined;

// A folder of the person's documents for the Bots named in the settings, read-only. A bad value is
// said here and leaves the feature off: it never stops the supervisor, which every computer depends on.
const documentsConfig = documentsSettings();
if (!documentsConfig.ok) {
  console.error(`${documentsConfig.reason} The documents folder stays off.`);
} else if (documentsConfig.note) {
  console.warn(documentsConfig.note);
}
const documentsNow = liveDocuments(
  documentsConfig.ok ? documentsConfig.documents : undefined,
);
// The first check is the one at start, and says why the folder cannot be used.
const documentsAtStart = await documentsNow();
if (documentsAtStart) {
  console.info(
    `Documents folder ${documentsAtStart.path}, read-only at /workspace/documenti, for: ${documentsAtStart.bots.join(", ")}.`,
  );
  if (await documentsFolderIsEmpty(documentsAtStart.path)) {
    console.warn(
      `The documents folder ${documentsAtStart.path} is empty. If it is a network share, check that it is mounted on this machine before the stack starts.`,
    );
  }
}

const app = new Hono();

app.use("*", async (context, next) => {
  // Health is open so an orchestrator can check it without holding the token.
  if (context.req.path === "/health") return next();
  if (!authorised(context.req.header("authorization"), token)) {
    return context.json({ error: "Unauthorized." }, 401);
  }
  return next();
});

app.get("/health", async (context) =>
  context.json({ status: "ok", docker: await reachable() }),
);

/** The Bot id in the path, validated before it becomes any kind of name. */
function resolve(raw: string) {
  return namesFor(raw);
}

app.post("/computers/:botId/ensure", async (context) => {
  const parsed = resolve(context.req.param("botId"));
  if (!parsed.ok) return context.json({ error: parsed.reason }, 400);

  try {
    // Registered before the computer is handed out, so it can prove which Bot it is from its first
    // request.
    const identity = await registerEntry(parsed.names);

    // Asked each time, so a folder that has gone away is not handed to a computer being created.
    const documents = await documentsNow();
    const state = await ensure(parsed.names, {
      image,
      environment: environmentFor(parsed.names.botId),
      ...(documents ? { documents } : {}),
      ...(network ? { network } : {}),
      ...(runtime ? { runtime } : {}),
      ...(memoryBytes ? { memoryBytes } : {}),
      ...(spireSocketVolume ? { spireSocketVolume } : {}),
    });
    return context.json({
      ...state,
      ...(identity.registered
        ? { spiffeId: identity.spiffeId }
        : { identity: identity.reason }),
    });
  } catch (error) {
    // A held name is not an outage. 409 says the conflict is with something already there, so an
    // operator reads the message rather than going to look at a daemon that is working.
    if (error instanceof NameHeldError) {
      return context.json({ error: error.message }, 409);
    }
    // Not ready is a 503 like an outage is, because the caller's next move is the same: wait and
    // ask again. The message is what differs, and it is the part an operator acts on.
    if (
      error instanceof DockerUnavailableError ||
      error instanceof ComputerNotAnsweringError
    ) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

app.post("/computers/:botId/stop", async (context) => {
  const parsed = resolve(context.req.param("botId"));
  if (!parsed.ok) return context.json({ error: parsed.reason }, 400);
  try {
    const stopped = await stop(parsed.names);
    return context.json({ stopped });
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

app.post("/computers/:botId/reset", async (context) => {
  const parsed = resolve(context.req.param("botId"));
  if (!parsed.ok) return context.json({ error: parsed.reason }, 400);
  try {
    const wasThere = await reset(parsed.names);
    return context.json({ reset: wasThere });
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

app.get("/computers", async (context) => {
  try {
    return context.json({ computers: await listOwned() });
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      return context.json({ error: error.message }, 503);
    }
    throw error;
  }
});

serve({
  port,
  /*
   * The name this machine was reached by, before Hono reads the URL, before the token and before any
   * verb. A page whose name was re-pointed at this machine's loopback sends the public development
   * token in a header and reads the answer, so the token alone is not what stops it: the name it was
   * addressed to is (host-guard.ts). `server` goes on as Hono's `env`, as it did when `app.fetch` was
   * the handler.
   */
  fetch: (request, server) =>
    hostGuard(request, server) ?? app.fetch(request, server),
  idleTimeout: 120,
});

console.info(
  `Supervisor listening on http://localhost:${port} (image ${image}${runtime ? `, runtime ${runtime}` : ""})`,
);
