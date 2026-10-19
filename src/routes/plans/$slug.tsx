import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { plans } from '@/lib/portal/demo';

export const Route = createFileRoute('/plans/$slug')({
  head: ({ params }) => {
    const plan = plans.find(p => p.name.toLowerCase().replace(/\s+/g, '-') === params.slug);
    return {
      meta: [
        { title: plan ? `${plan.name} — i-Save Savings Plan` : 'Plan not found — i-Save' },
        { name: 'description', content: plan ? plan.description : 'The savings plan you are looking for could not be found.' },
      ],
    };
  },
  component: PlanDetails,
});

function PlanDetails() {
  const { slug } = Route.useParams();
  const plan = plans.find(p => p.name.toLowerCase().replace(/\s+/g, '-') === slug);
  if (!plan) {
    return notFound();
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-6 py-12 md:py-20">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/plans"><ArrowRight className="h-4 w-4" />Back to plans</Link>
          </Button>
        </div>
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary mb-4">
              <plan.icon className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
            <CardDescription>{plan.description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-6">
              <div className="rounded-md border border-border bg-secondary/5 p-5">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">About this plan</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {plan.description} Terms, contribution amounts and eligibility are confirmed by the organisation. Contributions are made at the office and recorded by authorised staff.
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Get started</h3>
                <p className="mt-2 text-sm text-muted-foreground">Register as a member, then submit an application for this plan. Staff will review your application and confirm next steps.</p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full">
              <Link to="/register">Register as a member <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}
