import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { HomePage } from "@/components/site/HomePage";
import { NextChapter } from "@/components/site/NextChapter";
const state = vi.hoisted(() => ({
  contact: {
    email: "published@example.test",
    phones: [{ value: "+263 29 000 0000", href: "tel:+263290000000", label: "Office landline" }],
  } as { email: string; phones: { value: string; href: string; label: string }[] } | null,
  error: false,
  retry: vi.fn(),
}));
vi.mock("@/lib/live-public-contact", () => ({ usePublicContacts: () => state }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: { slug: string };
    children: React.ReactNode;
  }) => (
    <a href={params ? to.replace("$slug", params.slug) : to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  state.error = false;
  state.contact = {
    email: "published@example.test",
    phones: [{ value: "+263 29 000 0000", href: "tel:+263290000000", label: "Office landline" }],
  };
});
it("makes the requested headline and immediate next-step links available without animation", () => {
  render(<HomePage />);
  const hero = screen.getByRole("region", { name: "Save for what matters to you." });
  expect(within(hero).getByRole("link", { name: "Explore savings goals" })).toHaveAttribute(
    "href",
    "#goals",
  );
  expect(within(hero).getByRole("link", { name: "Apply for membership" })).toHaveAttribute(
    "href",
    "/register",
  );
  expect(within(hero).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  expect(screen.queryByText(/Illustrative sequence/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Eight visual steps only/)).not.toBeInTheDocument();
});
it("shows all five categories once with their own information routes and no enrolment promise", () => {
  render(<HomePage />);
  const goals = screen.getByRole("region", { name: "What are you saving for?" });
  expect(within(goals).getAllByRole("link")).toHaveLength(5);
  expect(
    within(goals).getByRole("link", { name: "Education — Explore this category" }),
  ).toHaveAttribute("href", "/plans/education-savings");
  expect(within(goals).getByText(/does not enrol you in a plan/)).toBeVisible();
});
it("uses published contact values rather than a hardcoded homepage address", () => {
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "published@example.test" })).toHaveAttribute(
    "href",
    "mailto:published@example.test",
  );
  expect(screen.getByRole("link", { name: "+263 29 000 0000" })).toHaveAttribute(
    "href",
    "tel:+263290000000",
  );
});
it("keeps the support route and a safe contact retry when live details are unavailable", () => {
  state.contact = null;
  state.error = true;
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "Need a hand? Contact the office" })).toHaveAttribute(
    "href",
    "/contact",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry contacts" }));
  expect(state.retry).toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "published@example.test" })).not.toBeInTheDocument();
});
it("runs one compact sequence once when visible and never announces its counter", () => {
  vi.useFakeTimers();
  let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof notify) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const { container } = render(<NextChapter />);
  expect(container.querySelector("[data-animate]")).toHaveAttribute("data-animate", "false");
  act(() => notify([{ isIntersecting: true }]));
  expect(screen.getByText("Step 01")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1600));
  expect(screen.getByText("Step 08")).toBeInTheDocument();
  act(() => notify([{ isIntersecting: true }]));
  expect(screen.getByText("Step 08")).toBeInTheDocument();
  expect(container.querySelector("[data-animate]")).toHaveAttribute("data-animate", "false");
  expect(container.querySelector(".chapter-art")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("[aria-live]")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
it("uses a static completed illustration for reduced motion", () => {
  const observer = vi.fn();
  vi.stubGlobal("IntersectionObserver", observer);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const { container } = render(<NextChapter />);
  expect(observer).not.toHaveBeenCalled();
  expect(screen.getByText("Step 08")).toBeInTheDocument();
  expect(container.querySelectorAll("[data-sequence-bar]")).toHaveLength(8);
});
it("server-renders the completed bars without captions or browser JavaScript", () => {
  const html = renderToString(<NextChapter />);
  expect(html.match(/data-sequence-bar/g)).toHaveLength(8);
  expect(
    new DOMParser().parseFromString(html, "text/html").querySelector(".chapter-counter")
      ?.textContent,
  ).toBe("Step 08");
  expect(html).not.toContain("figcaption");
  expect(html).not.toContain("aria-describedby");
  expect(html).toContain('data-animate="false"');
});
