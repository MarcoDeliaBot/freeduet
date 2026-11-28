import { IconShare } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/freeduet/i18n/provider";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import {
  decideSharedUseMutationOptions,
  describeApproval,
  type SharedUseRequestReason,
  sharedUseRequestsQueryOptions,
} from "@/lib/plugins/shared-use";

const WHY = {
  refused_call: "approvals.shared.why.refusedCall",
  publish: "approvals.shared.why.publish",
  trigger: "approvals.shared.why.trigger",
  grant: "approvals.shared.why.grant",
} as const satisfies Record<SharedUseRequestReason, string>;

/**
 * Requests to use a shared account, for an administrator to approve or decline: one row each,
 * saying what is approved now against what is asked, with the decision beneath. Nothing is drawn
 * for anyone else, or when nothing is waiting.
 */
export function SharedUseRequests() {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useQuery(currentUserQueryOptions()).data;
  const isAdmin = me?.role === "admin";
  const requests = useQuery(sharedUseRequestsQueryOptions(isAdmin));
  const decide = useMutation(decideSharedUseMutationOptions(queryClient));
  if (!isAdmin || !requests.data?.length) return null;

  return (
    <PageSection title={t("approvals.shared.title")}>
      {decide.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {decide.error.message}
        </p>
      ) : null}
      <PageRows>
        {requests.data.map((request, index) => (
          <Fragment key={request.id}>
            {index > 0 ? <Separator /> : null}
            <Item size="sm">
              <ItemMedia variant="icon">
                <IconShare />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="line-clamp-none">
                  {t("approvals.shared.wants", {
                    bot: request.botName,
                    account: request.title,
                  })}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {WHY[request.reason as SharedUseRequestReason]
                    ? t(WHY[request.reason as SharedUseRequestReason])
                    : request.reason}
                </ItemDescription>
                <p className="text-sm">
                  {t("approvals.shared.now")}{" "}
                  {request.current
                    ? describeApproval(request.current, t)
                    : t("approvals.shared.notApproved")}
                </p>
                <p className="text-sm">
                  {t("approvals.shared.asked")}{" "}
                  {describeApproval(request.proposed, t)}
                </p>
              </ItemContent>
              <ItemFooter className="justify-start">
                <Button
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ id: request.id, decision: "approve" })
                  }
                  size="sm"
                >
                  {t("approvals.shared.approve")}
                </Button>
                <Button
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ id: request.id, decision: "decline" })
                  }
                  size="sm"
                  variant="outline"
                >
                  {t("approvals.shared.decline")}
                </Button>
              </ItemFooter>
            </Item>
          </Fragment>
        ))}
      </PageRows>
    </PageSection>
  );
}
