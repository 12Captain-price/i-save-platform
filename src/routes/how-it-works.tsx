import { createFileRoute, Link } from '@tanstack/react-router';
import { UserPlus, Layers, Landmark, Wallet, History, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/how-it-works')({
  head: () => ({ meta: [
    { title: 'How i-Save Works — Three steps to start saving' },
    { name: 'description', content: 'Register, choose a plan, contribute at the office and track your progress online.' },
  ] }),
  component: HowItWorks,
});

function HowItWorks() {
  const STEPS = [
    { icon: UserPlus, title: 'Register as a member', text: 'Create your member account online or with assistance from staff at the office.' },
    { icon: Layers, title: 'Choose a savings plan', text: 'Select the savings category that matches your goal — Asset, Holiday, Emergency, Retrenchment or Education.' },
    { icon: Landmark, title: 'Contribute at the office', text: 'Make contributions in person. Authorised staff record each payment against your plan.' },
    { icon: Wallet, title: 'Track your savings', text: 'View your recorded contributions, application status and savings history online.' },
  ];

  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-20">
        <div className="text-center mb-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">How i-Save works</p>
          <h1 className="text-4xl font-bold sm:text-5xl">From intention to progress.</h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            Four steps to start building your savings with i-Save.
          </p>
        </div>

        <ol className="mt-12 grid gap-12 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary flex-shrink-0">
                <step.icon className="h-5 w-5" />
              </div>
              <span className="font-display text-2xl font-bold text-secondary">{i + 1}</span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <Card className="rounded-xl border border-border bg-card">
            <CardHeader>
              <CardTitle>Office payments only</CardTitle>
              <CardDescription>i-Save does not take payments online. All contributions are made in person and recorded by authorised staff.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-xl border border-border bg-card">
            <CardTitle>Sample data</CardTitle>
            <CardContent>
              <CardDescription>All names, amounts and dates shown are demonstration data. No real accounts or transactions are created.</CardDescription>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border bg-card">
            <CardHeader>
              <CardTitle>Fees are provisional</CardTitle>
              <CardDescription>Fee figures shown are unconfirmed configuration values, not approved policy.</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild><Link to="/register">Start your savings journey <ArrowRight /></Link></Button>
        </div>
      </div>
    </PublicLayout>
  );
}
