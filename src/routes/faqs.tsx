import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { faqs } from '@/lib/portal/demo';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle, Users, Wallet, Layers, ShieldCheck } from 'lucide-react';

const CATEGORY_ICONS: Record<string, typeof HelpCircle> = {
  Membership: Users,
  Contributions: Wallet,
  Plans: Layers,
  Fees: ShieldCheck,
};

export const Route = createFileRoute('/faqs')({
  head: () => ({ meta: [
    { title: 'FAQs — Frequently asked questions about i-Save' },
    { name: 'description', content: 'Answers to common questions about i-Save membership, savings plans, fees and contributions.' },
  ] }),
  component: FAQs,
});

function FAQs() {
  const categories = [...new Set(faqs.filter(f => f.published).map(f => f.category))];
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">FAQs</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Frequently asked questions</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Find answers about membership, savings plans, fees, contributions and support.
          </p>
        </div>

        <div className="space-y-4">
          {categories.map(category => {
            const catFaqs = faqs.filter(f => f.category === category && f.published).sort((a, b) => a.order - b.order);
            const Icon = CATEGORY_ICONS[category] || HelpCircle;
            return (
              <Accordion key={category} type="single" collapsible className="w-full">
                <AccordionItem key={category} value="item" className="rounded-md border border-border bg-card">
                  <AccordionTrigger className="flex items-center justify-between w-full py-4 text-left text-sm font-medium">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-portal-accent" />
                      <span>{category}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="py-4">
                    <div className="space-y-4">
                      {catFaqs.map(f => (
                                        <div key={f.id} className="pt-4 border-t border-border/50 first:pt-0 first:border-0">
                          <h3 className="text-sm font-semibold">{f.question}</h3>
                          <p className="mt-2 text-sm text-muted-foreground">{f.answer}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            );
          })}
        </div>

        <div className="mt-12 rounded-md border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Still need help?</h3>
          <p className="text-sm text-muted-foreground mb-4">Contact the office team if your question isn’t answered here.</p>
          <a href="/contact" className="text-sm text-primary hover:underline">Contact us <span className="ml-1">→</span></a>
        </div>
      </div>
    </PublicLayout>
  );
}
