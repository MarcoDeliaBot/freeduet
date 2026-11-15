import type { HandoffRequest } from "@openbot/shared/computer-control";
import type { NavigateResult } from "./schema";
import { checkNavigationTarget } from "./target";

/** The computer did not accept or answer a request. */
export class ComputerUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ComputerUnavailableError";
  }
}

/**
 * A person pressed Stop and the action was aborted mid-flight.
 *
 * A subclass of `ComputerUnavailableError` on purpose: everything downstream that catches an
 * unavailable computer to tell the model still catches this unchanged. What it adds is a type the
 * gateway can see, so the audit row it writes is `computer.action_stopped` rather than
 * `computer.action_failed` -- a stop is not an outage, and a count of failures that includes every
 * Stop reports one where there was none.
 */
export class ComputerStoppedError extends ComputerUnavailableError {
  constructor(reason: string) {
    super(reason);
    this.name = "ComputerStoppedError";
  }
}

/** The requested element is not on the current page. */
export class ElementNotFoundError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ElementNotFoundError";
  }
}

/**
 * The page could not be read because it would not settle.
 *
 * A page that kept reloading, redirected while it was being read, or did not finish loading in time.
 * Its own type, and not an unavailable computer or a missing element, because what a Bot does next
 * is neither: the computer answered and is running, and no ref is involved, so "take a fresh
 * snapshot" is the wrong instruction. The page is what failed, so the answer is to wait or try
 * another page. The message is the computer's own plain sentence and never carries the address.
 */
export class PageNotUsableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PageNotUsableError";
  }
}

/** The navigation target is not permitted. */
export class NavigationRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "NavigationRefusedError";
  }
}

/** The computer refused access to a path outside its workspace. */
export class WorkspaceRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "WorkspaceRefusedError";
  }
}

/** The workspace request names a path or value that cannot be used. */
export class WorkspaceRequestError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "WorkspaceRequestError";
  }
}

/** The workspace has no file at the requested path. */
export class WorkspaceNotFoundError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "WorkspaceNotFoundError";
  }
}

/** The requested workspace file is larger than the download limit. */
export class WorkspaceTooLargeError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "WorkspaceTooLargeError";
  }
}

/** Raw bytes and their size, kept as a stream until the caller sends them onward. */
export type ComputerDownload = {
  body: ReadableStream<Uint8Array>;
  bytes: number;
};

/** The page changed after the caller received its element references. */
export class StaleSnapshotError extends Error {
  constructor(
    reason: string,
    readonly snapshotRequired = false,
  ) {
    super(reason);
    this.name = "StaleSnapshotError";
  }
}

/**
 * A person has the wheel, so the Bot's action was not carried out.
 *
 * Its own condition rather than a stale snapshot, though both arrive as 409, because what the caller
 * should do next is the opposite in each case. Stale refs mean take a fresh snapshot and go again;
 * this means stop and leave the browser to the person holding it. Told apart by the flag the computer
 * puts on the body, which is the only thing in the response that distinguishes them.
 */
export class HumanHasControlError extends Error {
  constructor(
    reason: string,
    readonly requestId?: string,
    readonly handoff?: HandoffRequest,
  ) {
    super(reason);
    this.name = "HumanHasControlError";
  }
}

/** Invalid, unknown, or superseded handoff identity is distinct from page freshness. */
export class HandoffRequestError extends Error {
  constructor(
    reason: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(reason);
    this.name = "HandoffRequestError";
  }
}

/** How long the transport waits for the computer before it says so. */
export const DEFAULT_COMPUTER_TIMEOUT_MS = 45_000;

/**
 * Transport options used inside the computer gateway.
 *
 * This is an internal seam. Application code uses ComputerGateway and does not
 * use this interface directly.
 */
export type ComputerTransportOptions = {
  /** The one token every computer takes. Used only when `tokenFor` is not given. */
  token?: string;
  /**
   * The token of this Bot's own computer, for a deployment that gives each Bot one (the provider's
   * `tokenFor`). Given, it alone decides: `token` is not tried when it fails, because a computer that
   * has a token of its own must never be sent the one that opens the others.
   */
  tokenFor?: (botId: string) => Promise<string>;
  allowPrivateHosts?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * Where the one line saying why a call to the computer failed goes. Defaults to the server log.
   * It receives the route and the cause and never the address, the query string or a body.
   */
  log?: (entry: Record<string, unknown>) => void;
};

/** Internal HTTP interface used only by ComputerGateway. */
export interface ComputerTransport {
  call<T>(
    baseUrl: string,
    botId: string,
    path: string,
    init?: RequestInit,
    caller?: AbortSignal,
    /** Overrides the transport's own deadline for this one call. */
    timeoutMs?: number,
  ): Promise<T>;
  post<T>(
    baseUrl: string,
    botId: string,
    path: string,
    payload: unknown,
    caller?: AbortSignal,
    /** Overrides the transport's own deadline for this one call. */
    timeoutMs?: number,
  ): Promise<T>;
  navigate(
    baseUrl: string,
    botId: string,
    url: string,
    toolCallId?: string,
  ): Promise<NavigateResult>;
  download(
    baseUrl: string,
    botId: string,
    path: string,
    caller?: AbortSignal,
    timeoutMs?: number,
  ): Promise<ComputerDownload>;
}

/**
 * Send authenticated HTTP requests to one located agent-computer process.
 *
 * Lifecycle and location are deliberately absent. ComputerGateway owns those
 * operations through ComputerProvider.
 */
export function createComputerTransport(
  options: ComputerTransportOptions,
): ComputerTransport {
  const doFetch = options.fetchImpl ?? fetch;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_COMPUTER_TIMEOUT_MS;
  const log = options.log ?? ((entry) => console.warn(JSON.stringify(entry)));

  async function request(
    baseUrl: string,
    botId: string,
    path: string,
    init?: RequestInit,
    caller?: AbortSignal,
    timeoutMsOverride?: number,
  ): Promise<Response> {
    if (caller?.aborted) {
      throw new ComputerStoppedError("The action was stopped.");
    }

    /*
     * A browser action either happens in seconds or has gone wrong, so 45s is the right deadline for
     * it. A command is not that: the shell's own budget is 120s by default and up to 600s, and the
     * tool description tells the model to install packages. Giving up here first reported failure to
     * the person while the command carried on running to completion inside the container, and made
     * the shell's own limit unreachable. A caller with a longer limit of its own passes it in, and
     * this becomes the backstop rather than the limit.
     */
    const timeoutMs = timeoutMsOverride ?? defaultTimeoutMs;
    const target = baseUrl.replace(/\/$/, "");
    const startedAt = Date.now();

    /*
     * Which token this computer takes. Before the request, and a failure here sends nothing: the
     * alternative to refusing is guessing a token, and the only guess available is the one that
     * opens every other computer.
     */
    let token = options.token;
    if (options.tokenFor) {
      try {
        token = await options.tokenFor(botId);
      } catch (error) {
        log({
          type: "computer-transport-failure",
          reason: "token-unavailable",
          path: routeOf(path),
          botId,
          ms: Date.now() - startedAt,
          ...(error instanceof Error ? { errorName: error.name } : {}),
        });
        throw new ComputerUnavailableError(
          "The Bot's computer can't be reached because its access token isn't available.",
        );
      }
    }

    let response: Response;
    try {
      response = await doFetch(`${target}${path}`, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          "x-openbot-bot-id": botId,
          ...(token ? { "x-openbot-computer-token": token } : {}),
        },
        signal: caller
          ? AbortSignal.any([caller, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      /*
       * The caller's own abort is answered first, and says what the check above the fetch says.
       *
       * The signal is handed to fetch precisely so a Stop can land mid-flight, and a fetch aborted
       * that way rejects with an AbortError, which is neither a TimeoutError nor a computer that is
       * not running. Both of the other answers are statements about the infrastructure, and this
       * message is not only read by the model: the gateway writes it into the action's audit row,
       * and the type below is what keeps that row a stop rather than an outage.
       */
      if (caller?.aborted) {
        throw new ComputerStoppedError("The action was stopped.");
      }
      const reason = failureReason(error);
      /*
       * One sentence reaches the person for several different causes, and the container's own logs
       * look healthy for all of them, so the cause is written down here, where it is known. Nothing
       * the call carried goes in: the route without its query string, the Bot, the cause and how
       * long it had been waiting.
       */
      log({
        type: "computer-transport-failure",
        reason,
        path: routeOf(path),
        botId,
        ms: Date.now() - startedAt,
        ...(reason === "timeout" ? { limitMs: timeoutMs } : {}),
        ...(reason === "other" && error instanceof Error
          ? { errorName: error.name }
          : {}),
      });
      throw new ComputerUnavailableError(
        reason === "timeout"
          ? "The Bot's computer didn't respond in time."
          : reason === "connection-closed"
            ? "The Bot's computer closed the connection before it answered."
            : "The Bot's computer isn't running.",
      );
    }
    return response;
  }

  async function call<T>(
    baseUrl: string,
    botId: string,
    path: string,
    init?: RequestInit,
    caller?: AbortSignal,
    timeoutMsOverride?: number,
  ): Promise<T> {
    const response = await request(
      baseUrl,
      botId,
      path,
      init,
      caller,
      timeoutMsOverride,
    );
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!response.ok) {
      throwMappedError(response.status, body, path);
    }
    return body as T;
  }

  async function download(
    baseUrl: string,
    botId: string,
    path: string,
    caller?: AbortSignal,
    timeoutMs?: number,
  ): Promise<ComputerDownload> {
    const response = await request(
      baseUrl,
      botId,
      path,
      { method: "GET" },
      caller,
      timeoutMs,
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      throwMappedError(response.status, body, path);
    }

    const length = response.headers.get("content-length");
    const bytes =
      length !== null && /^\d+$/.test(length) ? Number(length) : Number.NaN;
    if (!response.body || !Number.isSafeInteger(bytes) || bytes < 0) {
      // Nothing else will ever read this body, so release it here rather than
      // leaving the whole download budget checked out of the pool. A cancel that
      // fails must not replace the refusal the caller is told about.
      await response.body?.cancel().catch(() => undefined);
      throw new ComputerUnavailableError(
        "The Bot's computer sent back a file that couldn't be read.",
      );
    }
    return { body: response.body, bytes };
  }

  function post<T>(
    baseUrl: string,
    botId: string,
    path: string,
    payload: unknown,
    caller?: AbortSignal,
    timeoutMs?: number,
  ): Promise<T> {
    return call<T>(
      baseUrl,
      botId,
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      caller,
      timeoutMs,
    );
  }

  async function navigate(
    baseUrl: string,
    botId: string,
    url: string,
    toolCallId?: string,
  ): Promise<NavigateResult> {
    const verdict = checkNavigationTarget(url, {
      allowPrivateHosts: options.allowPrivateHosts,
    });
    if (!verdict.allowed) {
      throw new NavigationRefusedError(verdict.reason);
    }
    return post<NavigateResult>(baseUrl, botId, "/navigate", {
      url: verdict.url,
      ...(toolCallId ? { toolCallId } : {}),
    });
  }

  return { call, post, navigate, download };
}

/** The routes that read a page, as opposed to acting on a ref in it. */
const PAGE_READ_ROUTES = new Set([
  "/navigate",
  "/snapshot",
  "/read",
  "/screenshot",
]);

/** The route a request went to, without its query string, so a log line cannot carry a file name. */
function routeOf(path: string): string {
  return path.split("?")[0] ?? path;
}

/**
 * Why a fetch to the computer threw, as one of a few causes an operator can act on.
 *
 * Read from the error's name, code and wording, which Bun and Node both vary, so each cause is a
 * short list of what either runtime says. Anything unrecognised stays `other`, and is reported as it
 * always was.
 */
function failureReason(
  error: unknown,
): "timeout" | "connection-refused" | "connection-closed" | "other" {
  if (!(error instanceof Error)) return "other";
  if (error.name === "TimeoutError") return "timeout";
  const code = String((error as { code?: unknown }).code ?? "");
  const text = `${code} ${error.message}`;
  if (
    /ECONNREFUSED|ConnectionRefused|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|Unable to connect/i.test(
      text,
    )
  )
    return "connection-refused";
  if (
    /ECONNRESET|ConnectionClosed|EPIPE|socket connection was closed|closed unexpectedly|other side closed|terminated/i.test(
      text,
    )
  )
    return "connection-closed";
  return "other";
}

/** Map agent-computer responses to errors that a caller can act on. */
function throwMappedError(
  status: number,
  body: Record<string, unknown> | null,
  path: string,
): never {
  const detail =
    typeof body?.error === "string" ? body.error : `HTTP ${status}`;
  if (
    body?.controlRequestError === true &&
    (status === 400 || status === 404 || status === 409)
  )
    throw new HandoffRequestError(detail, status);
  if (status === 409) {
    // The computer says which kind of 409 this is. Absent, it is the ordinary one.
    if (body?.humanHasControl === true) {
      throw new HumanHasControlError(
        detail,
        typeof body.requestId === "string" ? body.requestId : undefined,
        body.handoff && typeof body.handoff === "object"
          ? (body.handoff as HandoffRequest)
          : undefined,
      );
    }
    throw new StaleSnapshotError(detail, body?.snapshotRequired === true);
  }
  if (status === 403) {
    throw new WorkspaceRefusedError(detail);
  }
  if (status === 400) {
    throw new WorkspaceRequestError(detail);
  }
  if (status === 404) {
    throw new WorkspaceNotFoundError(detail);
  }
  if (status === 413) {
    throw new WorkspaceTooLargeError(detail);
  }
  /*
   * The computer says so when it gave up on a page that would not settle, in its own plain words.
   * That is a statement about the page, so it is passed on as one and never read for its text.
   */
  if (body?.pageNotReady === true) throw new PageNotUsableError(detail);
  if (/waiting for locator|Timeout .* exceeded/i.test(detail)) {
    /*
     * `Timeout 20000ms exceeded` is Playwright's wording for every wait that ran out, and only some
     * of them are about a ref. The words alone said "that element is gone" for a navigate that ran
     * out of time as well, which no ref was ever part of, and a Bot told to snapshot a page it never
     * reached asked for the same page again and got the same answer. Which wait it was is told by
     * the route it came back on, with the computer's own flag above taking precedence.
     */
    if (PAGE_READ_ROUTES.has(routeOf(path))) {
      throw new PageNotUsableError(
        "The page did not answer in time, so nothing could be read from it. Try again in a moment.",
      );
    }
    const ref = detail.match(/aria-ref=([A-Za-z0-9_-]+)/)?.[1];
    throw new ElementNotFoundError(
      `${ref ? `Element ${ref} is` : "That element is"} not on the page any more. Take a fresh snapshot and use the refs from it.`,
    );
  }
  throw new ComputerUnavailableError(detail);
}
