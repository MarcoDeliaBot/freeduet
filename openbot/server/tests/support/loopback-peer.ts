/**
 * The `env` a Bun server hands `app.fetch` for a connection from this machine's loopback.
 *
 * With no sign-in the administrator is a request whose TCP peer is loopback (auth/peer.ts), and a
 * request made in-process with `app.request(...)` has no peer, so it is nobody's. A test that is not
 * about the peer and needs the person passes this as the third argument.
 */
export const LOOPBACK_PEER = {
  server: { requestIP: () => ({ address: "127.0.0.1" }) },
};
