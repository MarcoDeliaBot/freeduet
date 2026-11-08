import React from "react";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";

/**
 * FreeDuet's About rows on the Settings page: what FreeDuet is, what it is built on, and that it is an
 * independent project. Kept in app/src/freeduet/ so the upstream page only gains one line
 * (docs/UPSTREAM_TOUCHES.md).
 */
const ABOUT: readonly { title: string; description: string }[] = [
  {
    title: "FreeDuet",
    description:
      "A free, open-source team of Bots. It runs on the AI plans you already have.",
  },
  {
    title: "Built on",
    description:
      "OpenDuet and OpenBot by CopilotKit, under the MIT license. Thank you to their authors.",
  },
  {
    title: "Independent project",
    description:
      "FreeDuet isn't affiliated with Anthropic, OpenAI, Google, xAI, Z.ai or CopilotKit.",
  },
];

export function FreeDuetAbout() {
  return (
    <PageSection title="About">
      <PageRows>
        {ABOUT.map((row, index) => (
          <React.Fragment key={row.title}>
            <Item size="sm">
              <ItemContent>
                <ItemTitle>{row.title}</ItemTitle>
                <ItemDescription>{row.description}</ItemDescription>
              </ItemContent>
            </Item>
            {index !== ABOUT.length - 1 && <Separator />}
          </React.Fragment>
        ))}
      </PageRows>
    </PageSection>
  );
}
