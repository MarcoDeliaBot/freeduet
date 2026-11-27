import { IconDeviceMobile, IconSend } from "@tabler/icons-react";
import { appConfig } from "@/lib/generated/application-config";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
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
import {
  deliveryQueryOptions,
  removePushDeviceMutationOptions,
} from "@/lib/delivery";
import { queryClient } from "@/query-client";

const PLATFORM: Record<"ios" | "android", string> = {
  ios: "iOS",
  android: "Android",
};

/** Local time to the second, as `Date.prototype.toLocaleString()` drew it, in the app's language. */
const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
};

/** The phones that receive push notifications for every one of the person's Bots. */
export function NativeDevices() {
  const reach = useQuery(deliveryQueryOptions());
  const remove = useMutation(removePushDeviceMutationOptions(queryClient));
  const { t } = useAppLanguage();
  const error = reach.error ?? remove.error;
  return (
    <PageSection
      description={t("settings.devicesDescription", {
        product: appConfig.brand.productName,
      })}
      title={t("settings.devicesTitle")}
    >
      {error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error.message}
        </p>
      ) : null}
      {reach.isPending || !reach.data ? null : reach.data.devices.length ===
        0 ? (
        <PageEmpty>{t("settings.devicesEmpty")}</PageEmpty>
      ) : (
        <PageRows>
          {reach.data.devices.map((device, index) => (
            <Fragment key={device.id}>
              {index > 0 ? <Separator /> : null}
              <Item size="sm">
                <ItemMedia variant="icon">
                  <IconDeviceMobile />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{PLATFORM[device.platform]}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Button
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(device.id)}
                    size="sm"
                    variant="outline"
                  >
                    {t("chat.remove")}
                  </Button>
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </PageRows>
      )}
    </PageSection>
  );
}

/** What was sent to the person outside the web app, most recent first, with any failure. */
export function RecentDeliveries() {
  const reach = useQuery(deliveryQueryOptions());
  const { t, date } = useAppLanguage();
  return (
    <PageSection title={t("settings.deliveriesTitle")}>
      {reach.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {reach.error.message}
        </p>
      ) : null}
      {reach.isPending || !reach.data ? null : reach.data.deliveries.length ===
        0 ? (
        <PageEmpty>{t("settings.deliveriesEmpty")}</PageEmpty>
      ) : (
        <PageRows>
          {reach.data.deliveries.map((delivery, index) => (
            <Fragment key={delivery.id}>
              {index > 0 ? <Separator /> : null}
              <Item size="sm">
                <ItemMedia variant="icon">
                  <IconSend />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {delivery.transport} · {delivery.kind}
                  </ItemTitle>
                  <ItemDescription>
                    {delivery.state} ·{" "}
                    {date(new Date(delivery.createdAt), DATE_TIME)}
                  </ItemDescription>
                  {delivery.error ? (
                    <ItemDescription className="line-clamp-none text-destructive">
                      {delivery.error}
                    </ItemDescription>
                  ) : null}
                </ItemContent>
              </Item>
            </Fragment>
          ))}
        </PageRows>
      )}
    </PageSection>
  );
}
