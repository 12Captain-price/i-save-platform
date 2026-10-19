import { createFileRoute, Link } from '@tanstack/react-router';
import { Building2, Plane, ShieldAlert, Briefcase, GraduationCap, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { plans } from '@/lib/portal/demo';

export const Route = createFileRoute('/plans')({
  head: () => ({ meta: [
    { title: 'Savings Plans — Five ways to save with purpose' },
    { name: 'description', content: 'Explore i-Save savings plans: Asset, Holiday, Emergency, Retrenchment and Education Savings.' },
  ] }),
  component: PlansPage,
});

function planSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function PlansPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-20">
        <div className="text-center mb-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Savings plans</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Five ways to save with purpose.</h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            Choose the plan that matches your goal. Plan details, contribution terms and eligibility are provided by the organisation.
          </p>
        </div>

        <ul className="grid gap-6 md:grid-cols-3">
          {plans.map((p, i) => {
            const slug = planSlug(p.name);
            return (
              <li key={p.name} className="flex flex-col">
                <Card className="rounded-xl border border-border bg-card h-full flex flex-col">
                  <CardHeader className="pb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-4">
                      <p.icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <span className="font-display text-sm text-muted-foreground">0{i + 1}</span>
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    <CardDescription className="text-sm">{p.description}</CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button variant="outline" className="w-full" asChild>
                      <Link to={`/plans/${slug}` as any}>View plan details <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>

        <div className="mt-12 border-t border-border pt-8 text-sm text-muted-foreground">
          <p>Terms, contribution amounts and eligibility for each plan are confirmed by the organisation. Speak with the office team for current plan information.</p>
        </div>
      </div>
    </PublicLayout>
  );
}
