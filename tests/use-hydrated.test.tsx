/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { waitFor } from "@testing-library/react";
import ReactDOMClient from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useHydrated } from "@/hooks/use-hydrated";

function HydrationProbe() {
  const isHydrated = useHydrated();

  return (
    <button disabled={!isHydrated} type="button">
      Ready
    </button>
  );
}

describe("useHydrated", () => {
  it("enables client-only actions immediately after hydration", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<HydrationProbe />);
    document.body.appendChild(container);

    ReactDOMClient.hydrateRoot(container, <HydrationProbe />);

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button).toBeDisabled();

    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });
});
