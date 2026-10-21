import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — i-Save" },
      { name: "description", content: "Draft privacy policy for i-Save savings membership." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Privacy policy
          </p>
          <h1 className="text-4xl font-bold sm:text-5xl">Privacy policy</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Draft policy for review by the organisation and legal counsel.
          </p>
        </div>

        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-6 mb-8">
          <h2 className="text-sm font-semibold text-destructive uppercase mb-2">
            Draft for review
          </h2>
          <p className="text-sm text-muted-foreground">
            This privacy policy is a draft template and requires organisational and legal review
            before official use. It does not claim compliance with any specific legal framework.
          </p>
        </div>

        <aside
          aria-label="Legal review dependency"
          className="mb-6 rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
        >
          The draft text below is retained for management and legal review. Statements about plan
          availability, fees and account services may be outdated. Read the{" "}
          <a href="/how-it-works" className="text-primary underline">
            current process
          </a>{" "}
          and{" "}
          <a href="/fees" className="text-primary underline">
            fee guidance
          </a>
          ; this site does not establish legal or regulatory approval.
        </aside>
        <div className="prose-lg text-sm text-muted-foreground space-y-6">
          <h2 className="text-lg font-semibold text-foreground">1. Information we collect</h2>
          <p>
            We may collect your name, email address, phone number, physical address and
            savings-related information when you register or interact with the organisation.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            2. How we use your information
          </h2>
          <p>
            Your information is used to administer your membership, record contributions, manage
            savings plan applications and communicate with you about your account.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            3. Access to your information
          </h2>
          <p>
            Authorised staff of the organisation may access your information to administer your
            account and process contributions.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">4. Retention</h2>
          <p>
            We retain your information for as long as necessary to administer your membership and
            comply with applicable requirements.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">5. Security</h2>
          <p>
            We take reasonable steps to protect your information. This is a demonstration prototype
            and does not implement production-grade security.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">6. Your rights</h2>
          <p>
            You may contact the organisation to request access to, correction of, or deletion of
            your information, subject to applicable requirements.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">7. Contact</h2>
          <p>
            If you have questions about this privacy policy, contact the organisation using the
            details on the Contact page.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
