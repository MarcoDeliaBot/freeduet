import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { DuetCard, OutcomePill } from "@/components/duet/kit";
import { PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { client } from "@/lib/client";
import {
  CLOUD_WARNING,
  checkText,
  FREE_MODELS_LOADING,
  FREE_MODELS_NOTE,
  FREE_NOTE,
  FREE_ROUTER_LABEL,
  freeModelsSourceText,
  KEY_PLACEHOLDER,
  KEY_REMOVED,
  KEY_SAVED,
  LABELS,
  LOCKED_OWN_FILE,
  modelsLoadedText,
  NOT_ON_YET_KEY,
  NOT_ON_YET_SETTINGS,
  PROVIDER_ORDER,
  PROVIDER_TEXT,
  PROVIDERS_DESCRIPTION,
  PROVIDERS_TITLE,
  type ProviderView,
  ROUTER_ADDRESS_NOTE,
  ROUTER_ADVANCED_NOTE,
  ROUTER_WARNING,
  SETTINGS_SAVED,
  TAG_TEXT,
  USE_FOR_NONE,
  USE_FOR_TITLE,
  warningFor,
  usersText,
} from "./engines-providers-text";
import { WorkspacePicker } from "./workspace";
import { blockText, type EnginesReading } from "./engines-text";

/**
 * The provider cards of the Engines page (D109, docs/design/engines-three-clicks.md): one card per provider, with a switch, the
 * server address, a model with "Load list", a key with Save and Remove, a Test button, a tag, and for a cloud service the
 * warning that what is sent leaves the computer. Three clicks: switch on, paste the key and Save, Test.
 *
 * The page holds no truth of its own. It sends the person's click and draws what the server answers. A key is typed into a
 * password field, sent once, and the field is emptied: the page never receives it back, only "saved". A card the service says
 * cannot be switched on (a paid engine, a trial that needs a card) has no working switch, and says why in words. Kept in
 * app/src/freeduet/ (docs/UPSTREAM_TOUCHES.md).
 */

const PROVIDERS_PATH = "/api/freeduet/engines/providers";

type Check = { ok: boolean; code: string };
type FreeModels = { models: string[]; source: string };
/** D116: the one card that chooses its model from OpenRouter's public list of free models that can use tools. */
const FREE_CHOICE_ID = "openrouter";
const FREE_ROUTER = "openrouter/free";

async function put(id: string, path: string, body: unknown, fallback: string) {
  return client(`${PROVIDERS_PATH}/${encodeURIComponent(id)}${path}`, {
    method: "PUT",
    body,
    fallback,
  });
}

function ProviderCard({
  card,
  canChange,
  memberName,
  onChanged,
}: {
  card: ProviderView;
  canChange: boolean;
  memberName: (id: string) => string;
  onChanged: () => void;
}) {
  const text = PROVIDER_TEXT[card.id];
  const tag = TAG_TEXT[card.tag];
  const ids = useId();
  const locked = !canChange || card.blocked !== null;
  const [address, setAddress] = useState(card.baseUrl);
  const [model, setModel] = useState(card.model || text.suggestedModel);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  /** The person switched it on and it still needs a key or a model, so the card is open and says what is left. */
  const [wantOn, setWantOn] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const freeChoice = card.id === FREE_CHOICE_ID;
  // The list is public and needs no key, so it is read as soon as the card is drawn. The server caches it and falls back
  // to the router alone when OpenRouter cannot be reached.
  const freeModels = useQuery({
    queryKey: ["freeduet", "engines", "free-models", card.id],
    enabled: freeChoice && card.blocked === null,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FreeModels> => {
      const response = await client(
        `${PROVIDERS_PATH}/${encodeURIComponent(card.id)}/free-models`,
        { method: "POST", fallback: "The list could not be loaded." },
      );
      return (await response.json()) as FreeModels;
    },
  });
  const sourceLine = freeModels.isPending
    ? FREE_MODELS_LOADING
    : freeModelsSourceText(freeModels.data?.source ?? "fallback");
  const freeOptions = [
    ...new Set([
      FREE_ROUTER,
      ...(freeModels.data?.models ?? []),
      ...(model.trim() ? [model.trim()] : []), // what the file holds stays choosable, so opening the card changes nothing
    ]),
  ];

  const settings = { baseUrl: address, model };
  const settingsChanged = address !== card.baseUrl || model !== card.model;
  const ready = !card.needsKey || card.keySaved;

  const done = (message: string) => {
    setSaid(message);
    onChanged();
  };

  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (on && (!ready || !model.trim())) {
        setWantOn(true);
        setSaid(null);
        return;
      }
      await put(
        card.id,
        "",
        { enabled: on, ...(on ? settings : {}) },
        "That could not be changed.",
      );
      setWantOn(false);
      done(SETTINGS_SAVED);
    },
  });
  const saveKey = useMutation({
    mutationFn: async () => {
      const value = key;
      setKey("");
      await put(card.id, "/key", { key: value }, "The key could not be saved.");
      if (wantOn && model.trim()) {
        await put(
          card.id,
          "",
          { enabled: true, ...settings },
          "That could not be changed.",
        );
        setWantOn(false);
      }
      setSaid(null);
      onChanged();
    },
  });
  const removeKey = useMutation({
    mutationFn: async () => {
      await client(`${PROVIDERS_PATH}/${encodeURIComponent(card.id)}/key`, {
        method: "DELETE",
        fallback: "The key could not be removed.",
      });
      setWantOn(false);
      done(KEY_REMOVED);
    },
  });
  const saveSettings = useMutation({
    mutationFn: async () => {
      const on = card.enabled || (wantOn && ready);
      await put(
        card.id,
        "",
        { enabled: on, ...settings },
        "That could not be saved.",
      );
      if (on) setWantOn(false);
      done(SETTINGS_SAVED);
    },
  });
  const choose = useMutation({
    mutationFn: async (members: string[]) => {
      await put(card.id, "", { members }, "That could not be changed.");
      done(SETTINGS_SAVED);
    },
  });
  const load = useMutation({
    mutationFn: async () => {
      const response = await client(
        `${PROVIDERS_PATH}/${encodeURIComponent(card.id)}/models`,
        { method: "POST", fallback: "The list could not be loaded." },
      );
      return (await response.json()) as Check & { models: string[] };
    },
    onSuccess: (result) => {
      setModels(result.models);
      setCheck(result.ok ? null : result);
      setSaid(result.ok ? modelsLoadedText(result.models.length) : null);
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      setCheck(null);
      const response = await client(
        `${PROVIDERS_PATH}/${encodeURIComponent(card.id)}/test`,
        { method: "POST", fallback: "The test could not be run." },
      );
      return (await response.json()) as Check;
    },
    onSuccess: (result) => {
      setSaid(null);
      setCheck(result);
    },
  });

  const busy =
    toggle.isPending ||
    saveKey.isPending ||
    removeKey.isPending ||
    saveSettings.isPending;
  const failure =
    toggle.error ??
    saveKey.error ??
    removeKey.error ??
    saveSettings.error ??
    load.error ??
    test.error;
  const on = card.enabled || wantOn;
  const needsKeyNow = wantOn && card.needsKey && !card.keySaved;
  const needsSettingsNow = wantOn && !needsKeyNow && !card.enabled;
  const canTest = !locked && ready && card.model !== "" && !settingsChanged;

  return (
    <DuetCard
      className="flex flex-col gap-4 p-5"
      data-slot="provider"
      data-provider={card.id}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-body font-semibold">{text.name}</h3>
            <OutcomePill icon={null} tone={tag.tone}>
              {tag.label}
            </OutcomePill>
          </div>
          <p className="type-label mt-1 text-duet-ink-2">{text.blurb}</p>
        </div>
        <Switch
          aria-label={`Switch on ${text.name}`}
          checked={on}
          disabled={locked || busy}
          onCheckedChange={(next) => {
            if (!next && !card.enabled) {
              setWantOn(false);
              return;
            }
            toggle.mutate(next);
          }}
        />
      </div>

      <p className="type-label text-duet-ink-2">{usersText(card)}</p>
      {card.tag === "router" ? (
        <p className="type-label text-duet-ink-2" role="note">
          {ROUTER_ADVANCED_NOTE}
        </p>
      ) : null}
      {card.cloud && card.blocked === null ? (
        <>
          <p className="type-label text-duet-amber" role="note">
            {card.tag === "router" ? ROUTER_WARNING : CLOUD_WARNING}
          </p>
          {card.tag === "free" ? (
            <p className="type-label text-duet-ink-2">{FREE_NOTE}</p>
          ) : null}
        </>
      ) : null}
      {card.useFor && card.enabled ? (
        <fieldset className="grid gap-1.5" disabled={locked || busy}>
          <legend className="type-label text-duet-ink-2">
            {USE_FOR_TITLE}
          </legend>
          {card.useFor.available.map((id) => {
            const ticked = card.useFor?.chosen.includes(id) ?? false;
            const warning = ticked ? warningFor(id) : null;
            return (
              <div key={id}>
                <label className="type-label flex items-center gap-2">
                  <input
                    checked={ticked}
                    onChange={() => {
                      const now = card.useFor?.chosen ?? [];
                      choose.mutate(
                        ticked
                          ? now.filter((item) => item !== id)
                          : [...now, id],
                      );
                    }}
                    type="checkbox"
                  />
                  {memberName(id)}
                </label>
                {warning ? (
                  <p className="type-label ml-6 text-duet-amber" role="note">
                    {warning}
                  </p>
                ) : null}
              </div>
            );
          })}
          {card.useFor.chosen.length === 0 ? (
            <p className="type-label text-duet-ink-2">{USE_FOR_NONE}</p>
          ) : null}
        </fieldset>
      ) : null}

      {card.blocked === null ? (
        <div className="grid gap-3">
          <label className="grid gap-1" htmlFor={`${ids}-address`}>
            <span className="type-label text-duet-ink-2">{LABELS.address}</span>
            <Input
              disabled={locked || card.addressFixed}
              id={`${ids}-address`}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={text.addressPlaceholder}
              value={address}
            />
          </label>
          {card.tag === "router" ? (
            <p className="type-label text-duet-ink-2">{ROUTER_ADDRESS_NOTE}</p>
          ) : null}

          {freeChoice ? (
            <div className="grid gap-1">
              <label
                className="type-label text-duet-ink-2"
                htmlFor={`${ids}-model`}
              >
                {LABELS.model}
              </label>
              <select
                className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
                disabled={locked}
                id={`${ids}-model`}
                onChange={(event) => setModel(event.target.value)}
                value={model.trim() || FREE_ROUTER}
              >
                {freeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name === FREE_ROUTER ? FREE_ROUTER_LABEL : name}
                  </option>
                ))}
              </select>
              {sourceLine ? (
                <p className="type-label text-duet-ink-2">{sourceLine}</p>
              ) : null}
              <p className="type-label text-duet-ink-2">{FREE_MODELS_NOTE}</p>
            </div>
          ) : (
            <div className="grid gap-1">
              <label
                className="type-label text-duet-ink-2"
                htmlFor={`${ids}-model`}
              >
                {LABELS.model}
              </label>
              <div className="flex gap-2">
                <Input
                  disabled={locked}
                  id={`${ids}-model`}
                  list={`${ids}-models`}
                  onChange={(event) => setModel(event.target.value)}
                  value={model}
                />
                <datalist id={`${ids}-models`}>
                  {models.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <Button
                  disabled={locked || load.isPending || !ready}
                  onClick={() => load.mutate()}
                  variant="outline"
                >
                  {LABELS.loadList}
                </Button>
              </div>
            </div>
          )}

          {card.needsKey ? (
            <div className="grid gap-1">
              <label
                className="type-label text-duet-ink-2"
                htmlFor={`${ids}-key`}
              >
                {LABELS.key}
              </label>
              {card.keySaved ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="type-label text-duet-green">{KEY_SAVED}</p>
                  <Button
                    disabled={locked || busy}
                    onClick={() => removeKey.mutate()}
                    variant="outline"
                  >
                    {LABELS.remove}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    autoComplete="off"
                    disabled={locked}
                    id={`${ids}-key`}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder={KEY_PLACEHOLDER}
                    spellCheck={false}
                    type="password"
                    value={key}
                  />
                  <Button
                    disabled={locked || busy || key.trim() === ""}
                    onClick={() => saveKey.mutate()}
                  >
                    {LABELS.save}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {needsKeyNow ? (
        <p className="type-label text-duet-ink-2" role="status">
          {NOT_ON_YET_KEY}
        </p>
      ) : null}
      {needsSettingsNow ? (
        <p className="type-label text-duet-ink-2" role="status">
          {NOT_ON_YET_SETTINGS}
        </p>
      ) : null}
      {said ? (
        <p className="type-label text-duet-ink-2" role="status">
          {said}
        </p>
      ) : null}
      {failure ? (
        <p className="type-label text-destructive" role="alert">
          {failure.message}
        </p>
      ) : null}

      {card.blocked === null ? (
        <div className="mt-auto flex flex-wrap items-center gap-3 border-duet-hair-2 border-t pt-3">
          {settingsChanged && ready ? (
            <Button
              disabled={locked || busy || model.trim() === ""}
              onClick={() => saveSettings.mutate()}
            >
              {LABELS.saveSettings}
            </Button>
          ) : null}
          <Button
            disabled={!canTest || test.isPending}
            onClick={() => test.mutate()}
            variant="outline"
          >
            {LABELS.test}
          </Button>
          {check ? (
            <p
              className={
                check.ok
                  ? "type-label text-duet-green"
                  : "type-label text-destructive"
              }
              role="status"
            >
              {checkText(check.code)}
            </p>
          ) : null}
        </div>
      ) : null}
    </DuetCard>
  );
}

export function EngineProviders({
  reading,
  onChanged,
  browse = false,
}: {
  reading: EnginesReading;
  onChanged: () => void;
  browse?: boolean;
}) {
  const [picked, setPicked] = useState("");
  const cards = reading.providers ?? [];
  const agents = useQuery({
    ...agentListQueryOptions(),
    enabled: cards.length > 0 && !reading.reason,
  });
  const memberName = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? id;
  if (reading.reason || cards.length === 0) return null;

  const locked = reading.providersLocked === "file_is_yours";
  const usable = reading.canChange === true && !locked;
  const block = reading.cannotChange ?? null;
  const ordered = PROVIDER_ORDER.flatMap((id) =>
    cards.filter((card) => card.id === id),
  );

  const selected =
    ordered.find((card) => card.id === picked) ??
    ordered.find((card) => card.enabled) ??
    ordered[0];
  return (
    <PageSection
      className="mt-0"
      description={PROVIDERS_DESCRIPTION}
      title={PROVIDERS_TITLE}
    >
      {locked ? (
        <p className="mt-3 text-duet-ink-2 text-sm">{LOCKED_OWN_FILE}</p>
      ) : null}
      {!usable && !locked && block && block !== "choices_unreadable" ? (
        <p className="mt-3 text-duet-ink-2 text-sm">{blockText(block)}</p>
      ) : null}
      {browse && selected && (
        <WorkspacePicker
          label="Provider"
          value={selected.id}
          onChange={setPicked}
          options={ordered.map((card) => ({
            id: card.id,
            label: PROVIDER_TEXT[card.id].name,
          }))}
        />
      )}
      <ul
        className={
          browse ? "fd-provider-list" : "mt-4 grid gap-4 lg:grid-cols-2"
        }
      >
        {ordered.map((card) => (
          <li
            className="min-w-0"
            key={card.id}
            hidden={browse && card.id !== selected?.id}
          >
            <ProviderCard
              canChange={usable}
              card={card}
              memberName={memberName}
              onChanged={onChanged}
            />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
