import { Link } from '@tanstack/react-router';
import { Mail, Phone, MapPin, Globe, ArrowRight, Mail as MailIcon } from 'lucide-react';
import { SiteHeader, NAV } from './SiteHeader';
import { Logo } from './Logo';
import { Button } from '@/components/ui/button';
import { contactInfo, siteContent } from '@/lib/portal/demo';

const zpyfLogo = '/images/zpyf-logo.png';

function getContent(key: string, fallback: string) {
  const item = siteContent.find(c => c.key === key && c.published);
  return item ? item.value.replace('{year}', new Date().getFullYear().toString()) : fallback;
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>{children}</main>
      <footer className="border-t border-border bg-surface-deep">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Structured savings for members of a Zimbabwean savings organisation.
            </p>
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <MailIcon className="h-4 w-4" /><Link to="/contact" className="text-primary hover:underline">Contact the team</Link>
            </p>
          </div>
          <nav aria-label="Footer">
            <h3 className="mb-4 text-sm font-semibold">Explore</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {NAV.map((n) => (
                <li key={n.href}><a href={n.href} className="hover:text-foreground">{n.label}</a></li>
              ))}
            </ul>
          </nav>
          <div>
            <h3 className="mb-4 text-sm font-semibold">Information</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="/faqs">FAQs</a></li>
              <li><a href="/terms">Terms</a></li>
              <li><a href="/privacy">Privacy</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-6">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-6 text-xs text-muted-foreground sm:flex-row sm:gap-4">
            <span>{getContent('footer', '© {year} i-Save')}</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span className="flex items-center gap-2">
              An initiative of
              <img
                src={zpyfLogo}
                alt="Zimbabwe Progressive Youth Foundation"
                width={1536}
                height={1024}
                className="h-7 w-auto rounded-sm bg-foreground/95 px-1"
              />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function ContactCard() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
      {contactInfo.map(c => (
        <div key={c.id} className="rounded-md border border-border bg-card p-5">
          <div className="flex items-center gap-3 min-w-0">
            {c.type === 'email' && <Mail className="h-5 w-5 shrink-0 text-portal-accent" />}
            {c.type === 'phone' && <Phone className="h-5 w-5 shrink-0 text-portal-accent" />}
            {c.type === 'address' && <MapPin className="h-5 w-5 shrink-0 text-portal-accent" />}
            {c.type === 'web' && <Globe className="h-5 w-5 shrink-0 text-portal-accent" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase truncate">{c.label}</p>
              <p className="text-sm text-foreground break-words">{c.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
