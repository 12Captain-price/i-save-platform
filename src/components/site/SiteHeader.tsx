import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Link } from "@tanstack/react-router";

export const NAV = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Savings goals", href: "/plans" },
  { label: "Fees", href: "/fees" },
  { label: "Contact", href: "/contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6 py-4">
        <Logo />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex gap-8 text-sm font-medium text-muted-foreground">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link to={n.href} className="transition-colors hover:text-foreground">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-6 lg:flex">
          <Link to="/login" className="text-sm font-semibold hover:text-primary">
            Log In
          </Link>
          <Link
            to="/register"
            className="rounded-sm bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            Apply for membership
          </Link>
        </div>
        <button
          ref={trigger}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="max-h-[calc(100dvh-76px)] overflow-y-auto border-t border-border bg-background px-6 pb-6 lg:hidden"
        >
          <ul className="flex flex-col py-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  to={n.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-border/50 py-4 font-display text-lg"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="rounded-sm border border-border py-3 text-center font-semibold"
            >
              Log In
            </Link>
            <Link
              to="/register"
              onClick={() => setOpen(false)}
              className="rounded-sm bg-primary py-3 text-center font-bold text-primary-foreground"
            >
              Get Started
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
