/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ProJobsCarousel } from "@/components/marketing/pro-jobs-carousel";

const jobs = Array.from({ length: 4 }, (_, index) => ({
  id: `synthetic-${index}`,
  title: `測試工作 ${index + 1}`,
  location: "沙田區",
  categoryId: "aircon",
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setupTrack() {
  render(<ProJobsCarousel locale="zh-HK" jobs={jobs} />);
  const track = screen.getByRole("list", { name: /工作機會列表/ });
  Object.defineProperties(track, {
    scrollWidth: { value: 1200 },
    clientWidth: { value: 300 },
  });
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    top: 100,
    bottom: 360,
  } as DOMRect);
  vi.spyOn(track.firstElementChild!, "getBoundingClientRect").mockReturnValue({
    width: 284,
  } as DOMRect);
  const scroll = vi.fn((options?: ScrollToOptions | number) => {
    track.scrollLeft =
      typeof options === "number" ? options : (options?.left ?? 0);
  });
  track.scrollTo = scroll;
  return { track, scroll };
}

it("rotates provided jobs, stops on interaction, resumes explicitly and wraps at the end", () => {
  const { track, scroll } = setupTrack();
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByText(/以發帖人確認為準/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /註冊睇工作/ })).toHaveAttribute(
    "href",
    "/auth/signup?role=pro",
  );
  act(() => vi.advanceTimersByTime(4500));
  expect(scroll).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });
  fireEvent.pointerDown(track);
  act(() => vi.advanceTimersByTime(9000));
  expect(scroll).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "開始工作輪播" }));
  act(() => vi.advanceTimersByTime(4500));
  expect(scroll).toHaveBeenLastCalledWith({ left: 600, behavior: "smooth" });
  track.scrollLeft = 900;
  act(() => vi.advanceTimersByTime(4500));
  expect(scroll).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
});

it("respects reduced motion while keeping manual navigation available", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  const { scroll } = setupTrack();
  act(() => vi.advanceTimersByTime(9000));
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "下一張工作" }));
  expect(scroll).toHaveBeenLastCalledWith({ left: 300, behavior: "instant" });
});

it("shows an honest empty state without sample jobs or carousel controls", () => {
  render(<ProJobsCarousel locale="zh-HK" jobs={[]} />);
  expect(screen.getByText(/暫時未有可顯示/)).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /註冊睇工作/ })).toBeInTheDocument();
});
