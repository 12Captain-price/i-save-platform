import { createFileRoute, Link } from '@tanstack/react-router';
import { Building2, ShieldCheck, Users, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/about')({
  head: () => ({ meta: [
    { title: 'About i-Save — Saving today for a better tomorrow' },
    { name: 'description', content: 'Learn about i-Save, the savings platform for members of a Zimbabwean savings organisation.' },
  ] }),
  component: About,
});

function About() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-20">
        <div className="text-center mb-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">About i-Save</p>
          <h1 className="text-4xl font-bold sm:text-5xl md:text-6xl">Built for savers, run by the community.</h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            i-Save helps members build savings, track recorded contributions and plan for what matters. Contributions are made in person at the organisation’s office and recorded by authorised staff. Members can view their savings, plan applications and contribution history online.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <Card className="rounded-xl border border-border bg-card">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Community-owned</CardTitle>
              <CardDescription>i-Save is organised for the benefit of its members. Every contribution is recorded and visible to you.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-xl border border-border bg-card">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Office-recorded payments</CardTitle>
              <CardDescription>All contributions are captured at the office by authorised staff — no online payment gateway.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-xl border border-border bg-card">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Member support</CardTitle>
              <CardDescription>Applications, support requests and announcements are handled by the organisation’s team.</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="mt-16 border-t border-border pt-12 flex flex-col items-center justify-between gap-6 sm:flex-row sm:justify-start">
          <p className="text-sm text-muted-foreground">
            i-Save is an initiative of the Zimbabwe Progressive Youth Foundation.
          </p>
          <Button asChild><Link to="/plans">Explore savings plans <ArrowRight /></Link></Button>
        </div>
      </div>
    </PublicLayout>
  );
}
