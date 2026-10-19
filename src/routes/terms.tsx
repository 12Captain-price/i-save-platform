import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [
    { title: 'Terms and Conditions — i-Save' },
    { name: 'description', content: 'Draft terms and conditions for i-Save savings membership.' },
  ] }),
  component: Terms,
});

function Terms() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Terms and conditions</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Terms and conditions</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Draft terms for review by the organisation and legal counsel.
          </p>
        </div>

        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-6 mb-8">
          <h3 className="text-sm font-semibold text-destructive uppercase mb-2">Draft for review</h3>
          <p className="text-sm text-muted-foreground">
            These terms are a draft template and require organisational and legal review before official use. They do not constitute a binding legal agreement.
          </p>
        </div>

        <div className="prose-lg text-sm text-muted-foreground space-y-6">
          <h2 className="text-lg font-semibold text-foreground">1. Membership</h2>
          <p>Membership in the i-Save savings organisation is open to eligible individuals who complete the registration process and whose application is approved by authorised staff.</p>

          <h2 className="text-lg font-semibold text-foreground mt-6">2. Contributions</h2>
          <p>Contributions are made in person at the organisation’s office and recorded by authorised staff. Recorded contributions are visible to members through their online account.</p>

          <h2 className="text-lg font-semibold text-foreground mt-6">3. Savings plans</h2>
          <p>The organisation offers Asset Savings, Holiday Savings, Emergency Savings, Retrenchment Savings and Education Savings plans. Plan terms and eligibility are set by the organisation.</p>

          <h2 className="text-lg font-semibold text-foreground mt-6">4. Fees</h2>
          <p>Provisional fee figures may be shown for demonstration purposes. Confirmed fees will be published by the organisation before any charges apply.</p>

          <h2 className="text-lg font-semibold text-foreground mt-6">5. Data and privacy</h2>
          <p>Member information is collected for the purpose of administering savings accounts and contributions. See the Privacy Policy for details.</p>

          <h2 className="text-lg font-semibold text-foreground mt-6">6. Changes to terms</h2>
          <p>The organisation may update these terms from time to time. Continued use of the service constitutes acceptance of the updated terms.</p>

          <h2 className="text-lg font-semibold text-foreground mt-6">7. Limitation of liability</h2>
          <p>This is a demonstration prototype. No real financial transactions are processed. The organisation is not liable for any loss arising from use of this demonstration.</p>
        </div>
      </div>
    </PublicLayout>
  );
}
