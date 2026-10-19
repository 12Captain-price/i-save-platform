import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, User, Clock, MapPin } from 'lucide-react';

export const Route = createFileRoute('/eligibility')({
  head: () => ({ meta: [
    { title: 'Eligibility — Who can join i-Save' },
    { name: 'description', content: 'Learn about membership eligibility for the i-Save savings platform.' },
  ] }),
  component: Eligibility,
});

function Eligibility() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Eligibility</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Who can join i-Save?</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Membership is open to individuals who wish to save with the organisation. Final eligibility requirements are set by the organisation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="rounded-xl border border-border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-4">
              <User className="h-5 w-5" />
            </div>
            <CardTitle>Open to individuals</CardTitle>
            <CardContent>
              <CardDescription>Membership is available to individuals who want to build savings with the organisation.</CardDescription>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-4">
              <MapPin className="h-5 w-5" />
            </div>
            <CardTitle>Zimbabwe-based</CardTitle>
            <CardContent>
              <CardDescription>i-Save serves members in Zimbabwe. Office contributions are made in Harare.</CardDescription>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary mb-4">
              <Clock className="h-5 w-5" />
            </div>
            <CardTitle>Review process</CardTitle>
            <CardContent>
              <CardDescription>Applications are reviewed by authorised staff. You will be notified of the outcome once a decision has been made.</CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 rounded-md border border-border bg-secondary/5 p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Important</h3>
          <p className="text-sm text-muted-foreground">
            Eligibility criteria and plan terms are determined by the organisation and may change. Contact the office team for current requirements before applying.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
