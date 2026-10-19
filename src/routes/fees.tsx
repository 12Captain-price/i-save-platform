import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Receipt, ShieldAlert } from 'lucide-react';

export const Route = createFileRoute('/fees')({
  head: () => ({ meta: [
    { title: 'Fees — i-Save savings charges and disclosures' },
    { name: 'description', content: 'Provisional fee information for i-Save savings membership and contributions.' },
  ] }),
  component: Fees,
});

function Fees() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Fees and charges</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Fee information</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Provisional figures are shown below for demonstration only. These have not been approved as final policy by the organisation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-xl border border-border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-4">
              <Wallet className="h-5 w-5" />
            </div>
            <CardTitle>Registration fee</CardTitle>
            <CardContent>
              <p className="text-2xl font-bold">$20</p>
              <p className="mt-2 text-sm text-muted-foreground">One-time, provisional. Charged when a membership application is approved.</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-4">
              <Receipt className="h-5 w-5" />
            </div>
            <CardTitle>Monthly subscription</CardTitle>
            <CardContent>
              <p className="text-2xl font-bold">$5</p>
              <p className="mt-2 text-sm text-muted-foreground">Monthly, provisional. Tracked separately from savings contributions.</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 rounded-md border border-destructive/20 bg-destructive/5 p-6">
          <div className="flex gap-3 mb-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Important disclosure</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            The $20 registration fee and $5 monthly fee shown above are unconfirmed configuration values used for demonstration purposes only. They do not represent approved organisation policy. The organisation will publish confirmed fee information before any charges apply.
          </p>
        </div>

        <div className="mt-12 rounded-md border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">How fees are handled</h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>All payments are made in person at the organisation’s office.</li>
            <li>Fees are recorded by authorised staff and appear in your contribution history.</li>
            <li>Subscription fees are tracked separately and are not added to your savings total.</li>
            <li>No payments are accepted online through this website.</li>
          </ul>
        </div>
      </div>
    </PublicLayout>
  );
}
