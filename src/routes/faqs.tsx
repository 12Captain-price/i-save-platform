import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PageIntro } from "@/components/site/SiteSections";
export const Route = createFileRoute("/faqs")({
  head: () => ({ meta: [{ title: "Frequently asked questions | i-Save" }] }),
  component: FAQs,
});
const questions = [
  [
    "Does applying create a login?",
    "No. Your details are saved as a Pending membership application. Account activation and password setup are separate steps after authorised review.",
  ],
  [
    "Can I enrol in a savings plan now?",
    "Only effective published plans are offered for a separate plan application by activated members. Read and acknowledge the complete terms before applying. Authorised review and activation are separate steps. A category expression of interest does not accept terms or enrol you.",
  ],
  [
    "Where do I pay?",
    "Payments are handled at the office, not online. Ask authorised staff to show the exact obligation and available payment currencies before you pay. Keep your receipt or reference.",
  ],
  [
    "Are fees part of my savings?",
    "No. Registration fees and subscriptions remain separate from savings. Your Fees page shows your recorded obligations and payments after account activation.",
  ],
  [
    "When do subscriptions start?",
    "In the calendar month following activation. Any configured due date belongs to the recorded obligation; overdue and penalty rules are not enabled.",
  ],
  [
    "How long will review take?",
    "No review deadline is promised. Contact the office for application follow-up and avoid duplicate submissions.",
  ],
  [
    "Will the website send me an email?",
    "Submitting an application does not mean an email was sent. Account-setup delivery depends on available delivery configuration and confirmed provider results.",
  ],
  [
    "I submitted incorrect information. Should I apply again?",
    "Contact the office with the name and email used to apply. Repeated submissions receive a generic acknowledgement and do not update the original record. Never send your password.",
  ],
];
function FAQs() {
  return (
    <PublicLayout>
      <div className="page-container max-w-3xl">
        <PageIntro eyebrow="Help and guidance" title="Frequently asked questions">
          <p>Understand applications, payments and account access before you begin.</p>
        </PageIntro>
        <div className="space-y-3">
          {questions.map(([question, answer]) => (
            <details key={question} className="rounded-xl border border-border bg-card p-5">
              <summary className="cursor-pointer text-base font-semibold">{question}</summary>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Still need help?{" "}
          <Link to="/contact" className="text-primary underline underline-offset-4">
            Contact the office
          </Link>
          .
        </p>
      </div>
    </PublicLayout>
  );
}
