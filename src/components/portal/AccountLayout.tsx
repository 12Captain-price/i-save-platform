import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeading, Field, Notice, inputClass, textareaClass } from '@/components/portal/PortalUI';


const logo = '/images/isave-logo-dark.png';
const zpyf = '/images/zpyf-logo.png';

export function AccountLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-6 flex items-center justify-between gap-3">
        <Link to="/" aria-label="i-Save public website">
          <img src={logo} alt="i-Save" width={1983} height={793} className="h-10 w-auto" />
        </Link>
        <Button variant="ghost" asChild>
          <Link to="/"><ArrowUpRight /> Public website</Link>
        </Button>
      </header>
      <main className="flex-1 mx-auto max-w-md w-full px-6 py-12">
        {children}
      </main>
      <footer className="border-t border-border px-6 py-6 text-xs text-muted-foreground">
        <span>i-Save</span>
        <span className="flex items-center gap-2">
          An initiative of
          <img src={zpyf} alt="Zimbabwe Progressive Youth Foundation" width={1536} height={1024} className="h-6 w-auto rounded-sm bg-foreground/95 px-1" />
        </span>
      </footer>
    </div>
  );
}

export function AccountForm({ screen }: { screen: string }) { return <div role="status"><h1 className="text-2xl font-semibold">Account service unavailable</h1><p className="mt-4 text-sm text-muted-foreground">Please use the login page for existing accounts or contact the office for assistance.</p><Button asChild className="mt-5"><Link to="/login">Log in</Link></Button></div>; }
