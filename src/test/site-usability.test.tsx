import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CategoryCards, ApplicationSteps, ContentEmpty } from "@/components/site/SiteSections";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Logo } from "@/components/site/Logo";
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
it("gives each savings category its own relevant destination without offering enrolment", () => {
  render(<CategoryCards />);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(5);
  expect(new Set(links.map((a) => a.getAttribute("href"))).size).toBe(5);
  expect(links[0]).toHaveAttribute("href", "/plans/asset-savings");
  expect(screen.queryByText(/enrol now/i)).not.toBeInTheDocument();
});
it("explains application and activation as separate steps", () => {
  render(<ApplicationSteps />);
  expect(screen.getByText(/does not create a login/)).toBeInTheDocument();
  expect(
    screen.getByText(/payment, verification and membership approval are separate/),
  ).toBeInTheDocument();
});
it("dismisses the mobile public menu with Escape and restores trigger focus", () => {
  render(<SiteHeader />);
  const trigger = screen.getByRole("button", { name: "Open menu" });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveFocus();
});
it("makes the logo return to the homepage from any route", () => {
  render(<Logo />);
  expect(screen.getByRole("link", { name: "iSave home" })).toHaveAttribute("href", "/");
});
it("offers a real support route while approved content is missing", () => {
  render(<ContentEmpty title="No events">Awaiting approved details.</ContentEmpty>);
  expect(screen.getByRole("link", { name: "Contact the office" })).toHaveAttribute(
    "href",
    "/contact",
  );
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("No events");
});
