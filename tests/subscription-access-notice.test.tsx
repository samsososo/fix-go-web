/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    locale,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
    locale?: string;
  }) => {
    void locale;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

import { SubscriptionAccessNotice } from "@/features/pro/subscription-access-notice";
import type { ProSubscriptionEntitlementSnapshot } from "@/lib/pro-subscription-entitlement";

function snapshot(
  overrides: Partial<ProSubscriptionEntitlementSnapshot["entitlement"]> = {},
): ProSubscriptionEntitlementSnapshot {
  return {
    subscription: null,
    policyDataValid: true,
    entitlement: {
      status: "setup_required",
      canCreateQuotes: false,
      canAcceptNewWork: false,
      canManageExistingWork: true,
      canManageBilling: true,
      effectiveUntil: undefined,
      ...overrides,
    },
  };
}

describe("subscription access notice", () => {
  it("does not add noise while full access is active", () => {
    const { container } = render(
      <SubscriptionAccessNotice
        locale="en"
        snapshot={snapshot({
          status: "active",
          canCreateQuotes: true,
          canAcceptNewWork: true,
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("explains that existing work remains available while suspended", () => {
    render(
      <SubscriptionAccessNotice
        locale="zh-HK"
        snapshot={snapshot({ status: "suspended" })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("新報價同新工作已暫停");
    expect(screen.getByRole("alert")).toHaveTextContent("處理現有工作");
    expect(screen.getByRole("link", { name: /管理月費/ })).toHaveAttribute(
      "href",
      "/pro/billing",
    );
  });

  it("shows the grace deadline without disabling new-work access", () => {
    render(
      <SubscriptionAccessNotice
        locale="en"
        snapshot={snapshot({
          status: "grace_period",
          canCreateQuotes: true,
          canAcceptNewWork: true,
          effectiveUntil: "2026-08-24T12:00:00.000Z",
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "New-work access remains available until",
    );
    expect(screen.getByRole("status")).toHaveTextContent("8/24/2026");
  });
});
