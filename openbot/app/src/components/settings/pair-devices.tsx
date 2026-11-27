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
import { useAppLanguage } from "@/freeduet/i18n/provider";
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
  const { t } = useAppLanguage();
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
      description={t("settings.pairThisDescription")}
      title={t("settings.pairThisTitle")}
    >
      {done ? (
        <p className="mt-4 text-sm" role="status">
          {t("settings.pairedDone")}
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
            <p className="text-sm">{t("settings.linkBroughtCode")}</p>
          ) : null}
          <div className="flex flex-col gap-1 text-sm">
            <span aria-hidden>{t("settings.code")}</span>
            <Input
              aria-label={t("settings.code")}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(event) => setCode(event.target.value)}
              placeholder="ABCDE-FGHJK"
              value={code}
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span aria-hidden>{t("settings.name")}</span>
            <Input
              aria-label={t("settings.name")}
              autoComplete="off"
              maxLength={60}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("settings.phone")}
              value={label}
            />
          </div>
          <Button disabled={pair.isPending || !code.trim()} type="submit">
            {t("settings.pairThisTitle")}
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
  const { t } = useAppLanguage();
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
      description={t("settings.pairedDescription")}
      title={t("settings.pairedTitle")}
    >
      {canPair ? (
        <div className="mt-4">
          <Button
            disabled={mint.isPending}
            onClick={() => mint.mutate()}
            variant="outline"
          >
            {t("settings.makeCode")}
          </Button>
        </div>
      ) : (
        <PageEmpty>{t("settings.cannotMakeCode")}</PageEmpty>
      )}
      {code && secondsLeft > 0 && link ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            {t("settings.runsOut", {
              time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`,
            })}
          </p>
          <QrCode label={t("settings.qrLabel")} text={link} />
          <p className="font-mono text-lg tracking-wider">{code.made.code}</p>
          <p className="break-all text-muted-foreground text-xs">{link}</p>
          {isLocalAddress(link) ? (
            <p className="text-muted-foreground text-sm" role="note">
              {t("settings.localAddress")}
            </p>
          ) : null}
        </div>
      ) : code ? (
        <p className="mt-4 text-muted-foreground text-sm" role="status">
          {t("settings.codeRanOut")}
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
  const { t } = useAppLanguage();
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
            aria-label={t("settings.name")}
            autoFocus
            maxLength={60}
            onChange={(event) => onEdit(event.target.value)}
            value={editing}
          />
        ) : (
          <ItemTitle>
            {pairing.label}
            {pairing.current ? ` ${t("settings.thisBrowserTag")}` : ""}
          </ItemTitle>
        )}
        <ItemDescription>
          {pairing.kind === "computer"
            ? t("settings.computer")
            : t("settings.phoneOrBrowser")}
          {" · "}
          {t("settings.madeWhen", { when: whenWords(pairing.createdAt) })}
          {" · "}
          {t("settings.lastSeen", { when: whenWords(pairing.lastSeenAt) })}
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
                {t("settings.save")}
              </Button>
              <Button onClick={onCancel} size="sm" variant="outline">
                {t("settings.cancel")}
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
                {t("settings.rename")}
              </Button>
              <Button
                disabled={busy}
                onClick={onRevoke}
                size="sm"
                variant="outline"
              >
                {t("settings.revoke")}
              </Button>
            </>
          )}
        </ItemActions>
      ) : null}
    </Item>
  );
}
