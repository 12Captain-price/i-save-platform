import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Plane,
  Shield,
  Briefcase,
  GraduationCap,
  Phone,
  Mail,
} from "lucide-react";
import { PublicLayout } from "./PublicLayout";
import { Button } from "@/components/ui/button";
import { savingsInterest } from "@/lib/savings-interest";
import { usePublicContacts } from "@/lib/live-public-contact";
import { NextChapter } from "./NextChapter";
import "./homepage.css";

const icons = [Building2, Plane, Shield, Briefcase, GraduationCap];
function HomeContact() {
  const { contact, error, retry } = usePublicContacts();
  return (
    <div className="home-contact">
      <Link to="/contact" className="home-help-link">
        Need a hand? Contact the office
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
      {contact ? (
        <div className="home-contact-links">
          <a href={contact.phones[0]!.href}>
            <Phone size={15} aria-hidden="true" />
            {contact.phones[0]!.value}
          </a>
          <a href={"mailto:" + contact.email}>
            <Mail size={15} aria-hidden="true" />
            {contact.email}
          </a>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {error
            ? "Published contact details are temporarily unavailable."
            : "Loading published contact details…"}
          {error && (
            <button type="button" onClick={retry} className="ml-2 text-primary underline">
              Retry contacts
            </button>
          )}
        </p>
      )}
    </div>
  );
}
export function HomePage() {
  return (
    <PublicLayout>
      <div className="home-page">
        <section aria-labelledby="home-title" className="home-hero home-width">
          <div className="home-hero-copy">
            <p className="home-eyebrow">Saving today. Planning for tomorrow.</p>
            <h1 id="home-title">
              Save for what <span>matters to you.</span>
            </h1>
            <p className="home-lead">
              From education to life’s unexpected moments, start with a goal and explore your next
              steps with i-Save.
            </p>
            <div className="home-actions">
              <Button asChild size="lg">
                <a href="#goals">
                  Explore savings goals
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/register">Apply for membership</Link>
              </Button>
            </div>
            <p className="home-login">
              Already have an activated account? <Link to="/login">Log in</Link>.
            </p>
          </div>
          <NextChapter />
        </section>
        <section id="goals" aria-labelledby="home-goals-title" className="home-goals-section">
          <div className="home-width">
            <div className="home-section-heading">
              <p className="home-eyebrow">Start with a purpose</p>
              <h2 id="home-goals-title">What are you saving for?</h2>
            </div>
            <ul className="home-goals">
              {savingsInterest.categories.map((category, index) => {
                const Icon = icons[index]!;
                return (
                  <li key={category.id}>
                    <Link
                      to="/plans/$slug"
                      params={{ slug: category.id + "-savings" }}
                      aria-label={category.label + " — Explore this category"}
                      className="home-goal"
                    >
                      <Icon className="home-goal-icon" aria-hidden="true" />
                      <div>
                        <h3>{category.label}</h3>
                        <p>{category.purpose}</p>
                      </div>
                      <ArrowRight className="home-goal-arrow" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="home-interest-note">
              Choosing a category expresses interest; it does not enrol you in a plan. Plan terms
              are awaiting confirmation. Draft and unpublished plans are not approved offers.
            </p>
          </div>
        </section>
        <section aria-labelledby="home-journey-title" className="home-journey home-width">
          <div className="home-section-heading">
            <p className="home-eyebrow">A simple journey</p>
            <h2 id="home-journey-title">Your next steps, clearly explained.</h2>
          </div>
          <ol className="home-stages">
            {[
              [
                "Apply for membership.",
                "Submit your details for review. No login account is created.",
              ],
              [
                "Complete office review and registration-fee verification.",
                "Authorised staff review your details and verify the recorded fee separately.",
              ],
              [
                "Set up account access after approval and activation.",
                "Follow the setup instructions when available. Plan approval stays separate.",
              ],
            ].map(([title, text], index) => (
              <li key={title}>
                <span className="home-stage-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link to="/how-it-works" className="home-text-link">
            Read how it works
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <section aria-labelledby="home-expect-title" className="home-expect">
          <div className="home-width home-expect-layout">
            <div>
              <p className="home-eyebrow">Know what to expect</p>
              <h2 id="home-expect-title">A little clarity before you begin.</h2>
              <Link to="/fees" className="home-text-link">
                Fees and office payments
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <ul>
              {[
                [
                  "Applications require review.",
                  "Submitting your details does not confirm membership or provide login access.",
                ],
                [
                  "Payments follow the approved office process.",
                  "No online payment gateway is available. Keep your receipt or payment reference.",
                ],
                [
                  "Fees are separate from savings.",
                  "Registration fees and subscriptions do not increase savings.",
                ],
                [
                  "Interest is separate from enrolment.",
                  "A savings-category preference does not accept terms or approve a plan.",
                ],
              ].map(([title, text]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section aria-labelledby="home-closing-title" className="home-closing home-width">
          <div>
            <p className="home-eyebrow">Take your next step</p>
            <h2 id="home-closing-title">Ready to begin with a goal?</h2>
            <p className="mt-3 text-muted-foreground">
              Start with a membership application. The office team can help with questions along the
              way.
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link to="/register">
                Apply for membership
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <HomeContact />
        </section>
      </div>
    </PublicLayout>
  );
}
