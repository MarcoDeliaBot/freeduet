import { IconDeviceMobile, IconDeviceDesktop } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { authKeys, currentUserQueryOptions } from "@/lib/auth/queries";
import {
  type BrowserPairing,
  isLocalAddress,
  makePairingCode,
  type PairingCode,
  pairingLink,
  pairingsKey,
  pairingsQueryOptions,
  redeemPairingCode,
  renamePairing,
  revokePairing,
  takeCodeFromAddress,
  whenWords,
} from "@/lib/pairings";
import { qrFits, qrModules } from "@/lib/qr";

/**
 * A QR code drawn in the page from the link, with no service and no image file: one path of squares. Shown with a
 * white border (the quiet zone a phone's camera needs) whatever the theme.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  if (!qrFits(text)) return null;
  const grid = qrModules(text);
  const quiet = 4;
  const size = grid.length + quiet * 2;
  let path = "";
  for (const [y, row] of grid.entries())
    for (const [x, dark] of row.entries())
      if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  return (
    <svg
      aria-label={label}
      className="size-44 rounded-md bg-white"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${size} ${size}`}
    >
      <path d={path} fill="#000" />
    </svg>
  );
}

/**
 * Settings, "Pair a phone or another browser" (docs/M1_PLAN.md D49). In a browser that is not paired it is the other
 * end: "Pair this browser", where the code is typed or opened from a link. In a paired browser it lists every pairing and,
 * in one paired at the computer, makes the code. Where the deployment has no pairing at all it draws nothing.
 */
export function PairDevicesSection() {
  const user = useQuery(currentUserQueryOptions());
  if (user.data?.remote === true) return <PairThisBrowser />;
  return <PairedBrowsers />;
}

/** The phone's side: a code from the link or typed, and a name, then one press. */
export function PairThisBrowser() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [done, setDone] = useState(false);

  // The code is in the address bar's fragment. It is taken out of the address first, before anything is sent, so it is
  // not left in the history, a screenshot of the address or a copy of the link.
  useEffect(() => {
    const found = takeCodeFromAddress(window);
    if (found) {
      setCode(found);
      setFromLink(true);
    }
  }, []);

  const pair = useMutation({
    mutationFn: () => redeemPairingCode(code, label),
    onSuccess: async () => {
      setDone(true);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: authKeys.currentUser() });
      await queryClient.invalidateQueries({ queryKey: pairingsKey });
    },
  });

  return (
    <PageSection
      description="On the computer FreeDuet runs on, open Settings, press Make a code under Pair a phone or another browser, then open the link it shows or type the code here."
      title="Pair this browser"
    >
      {done ? (
        <p className="mt-4 text-sm" role="status">
          This browser is paired with the computer.
        </p>
      ) : (
        <form
          className="mt-4 flex max-w-sm flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) pair.mutate();
          }}
        >
          {fromLink ? (
            <p className="text-sm">
              The link brought a code. Name this browser and press Pair.
            </p>
          ) : null}
          <div className="flex flex-col gap-1 text-sm">
            <span aria-hidden>Code</span>
            <Input
              aria-label="Code"
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(event) => setCode(event.target.value)}
              placeholder="ABCDE-FGHJK"
              value={code}
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span aria-hidden>Name</span>
            <Input
              aria-label="Name"
              autoComplete="off"
              maxLength={60}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Phone"
              value={label}
            />
          </div>
          <Button disabled={pair.isPending || !code.trim()} type="submit">
            Pair this browser
          </Button>
          {pair.error ? (
            <p className="text-destructive text-sm" role="alert">
              {pair.error.message}
            </p>
          ) : null}
        </form>
      )}
    </PageSection>
  );
}

/** The computer's side: the code, the link, the QR, and the list with Revoke. */
export function PairedBrowsers() {
  const queryClient = useQueryClient();
  const list = useQuery(pairingsQueryOptions());
  const [code, setCode] = useState<{ made: PairingCode; until: number } | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [renaming, setRenaming] = useState<{
    id: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [code]);

  const mint = useMutation({
    mutationFn: makePairingCode,
    onSuccess: (made) =>
      setCode({ made, until: Date.now() + made.expiresInSeconds * 1000 }),
  });
  const revoke = useMutation({
    mutationFn: revokePairing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pairingsKey }),
  });
  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      renamePairing(id, label),
    onSuccess: async () => {
      setRenaming(null);
      await queryClient.invalidateQueries({ queryKey: pairingsKey });
    },
  });

  // Nothing to show: this deployment does not pair browsers, or this browser is not one that is paired.
  if (!list.data) return null;
  const { pairings, canPair, appUrl } = list.data;

  const base = code?.made.link
    ? null
    : (appUrl ?? (typeof window === "undefined" ? "" : window.location.origin));
  const link =
    code?.made.link ??
    (code && base ? pairingLink(base, code.made.code) : null);
  const secondsLeft = code
    ? Math.max(0, Math.ceil((code.until - now) / 1000))
    : 0;
  const error = mint.error ?? revoke.error ?? rename.error;

  return (
    <PageSection
      description="A phone or another browser that is paired works like this one. Revoke one and it is cut off at its next request."
      title="Pair a phone or another browser"
    >
      {canPair ? (
        <div className="mt-4">
          <Button
            disabled={mint.isPending}
            onClick={() => mint.mutate()}
            variant="outline"
          >
            Make a code
          </Button>
        </div>
      ) : (
        <PageEmpty>
          A code is made in the browser paired at the computer. This one cannot
          make one.
        </PageEmpty>
      )}
      {code && secondsLeft > 0 && link ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            On the phone, signed in as you, scan this or open the link, or open
            Settings and type the code. It works once and runs out in{" "}
            {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")}.
          </p>
          <QrCode label="QR code with the pairing link" text={link} />
          <p className="font-mono text-lg tracking-wider">{code.made.code}</p>
          <p className="break-all text-muted-foreground text-xs">{link}</p>
          {isLocalAddress(link) ? (
            <p className="text-muted-foreground text-sm" role="note">
              This address only works on this computer. A phone needs the
              address FreeDuet is reached at from outside; open that on the
              phone and type the code in Settings.
            </p>
          ) : null}
        </div>
      ) : code ? (
        <p className="mt-4 text-muted-foreground text-sm" role="status">
          That code has run out. Make a new one.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error.message}
        </p>
      ) : null}
      <PageRows>
        {pairings.map((pairing, index) => (
          <Fragment key={pairing.id}>
            {index > 0 ? <Separator /> : null}
            <PairingRow
              busy={revoke.isPending || rename.isPending}
              canManage={canPair || pairing.current}
              editing={renaming?.id === pairing.id ? renaming.label : null}
              onEdit={(label) => setRenaming({ id: pairing.id, label })}
              onSave={() =>
                renaming
                  ? rename.mutate({ id: pairing.id, label: renaming.label })
                  : undefined
              }
              onCancel={() => setRenaming(null)}
              onRevoke={() => revoke.mutate(pairing.id)}
              pairing={pairing}
            />
          </Fragment>
        ))}
      </PageRows>
    </PageSection>
  );
}

function PairingRow({
  pairing,
  busy,
  canManage,
  editing,
  onEdit,
  onSave,
  onCancel,
  onRevoke,
}: {
  pairing: BrowserPairing;
  busy: boolean;
  canManage: boolean;
  editing: string | null;
  onEdit: (label: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onRevoke: () => void;
}) {
  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        {pairing.kind === "computer" ? (
          <IconDeviceDesktop />
        ) : (
          <IconDeviceMobile />
        )}
      </ItemMedia>
      <ItemContent>
        {editing !== null ? (
          <Input
            aria-label="Name"
            autoFocus
            maxLength={60}
            onChange={(event) => onEdit(event.target.value)}
            value={editing}
          />
        ) : (
          <ItemTitle>
            {pairing.label}
            {pairing.current ? " (this browser)" : ""}
          </ItemTitle>
        )}
        <ItemDescription>
          {pairing.kind === "computer" ? "Computer" : "Phone or other browser"}
          {" · "}made {whenWords(pairing.createdAt)}
          {" · "}last seen {whenWords(pairing.lastSeenAt)}
        </ItemDescription>
      </ItemContent>
      {canManage ? (
        <ItemActions>
          {editing !== null ? (
            <>
              <Button
                disabled={busy || !editing.trim()}
                onClick={onSave}
                size="sm"
              >
                Save
              </Button>
              <Button onClick={onCancel} size="sm" variant="outline">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={busy}
                onClick={() => onEdit(pairing.label)}
                size="sm"
                variant="outline"
              >
                Rename
              </Button>
              <Button
                disabled={busy}
                onClick={onRevoke}
                size="sm"
                variant="outline"
              >
                Revoke
              </Button>
            </>
          )}
        </ItemActions>
      ) : null}
    </Item>
  );
}
