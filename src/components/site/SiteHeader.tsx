import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Link } from "@tanstack/react-router";

export const NAV = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Savings Plans", href: "/plans" },
  { label: "Fees", href: "/fees" },
  { label: "Contact", href: "/contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6 py-4">
        <Logo />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex gap-8 text-sm font-medium text-muted-foreground">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link to={n.href} className="transition-colors hover:text-foreground">{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-6 lg:flex">
          <Link to="/portal/$role/$screen" params={{ role: "member", screen: "login" }} className="text-sm font-semibold hover:text-primary">Log In</Link>
          <Link to="/register" className="rounded-sm bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5">
            Get Started
          </Link>
        </div>
        <button
          className="lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-border px-6 pb-6 lg:hidden">
          <ul className="flex flex-col py-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link to={n.href} onClick={() => setOpen(false)} className="block border-b border-border/50 py-4 font-display text-lg">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link to="/portal/$role/$screen" params={{ role: "member", screen: "login" }} onClick={() => setOpen(false)} className="rounded-sm border border-border py-3 text-center font-semibold">Log In</Link>
            <Link to="/register" onClick={() => setOpen(false)} className="rounded-sm bg-primary py-3 text-center font-bold text-primary-foreground">Get Started</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
