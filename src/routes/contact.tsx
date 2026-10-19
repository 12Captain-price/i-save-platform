import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicLayout, ContactCard } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/contact')({
  head: () => ({ meta: [{ title: 'Contact i-Save' }, { name: 'description', content: 'Contact the office for registration help and application follow-up.' }] }),
  component: Contact,
});
export function Contact() {
  return <PublicLayout><div className="mx-auto max-w-5xl px-6 py-12 md:py-20">
    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Contact and support</p>
    <h1 className="text-4xl font-bold sm:text-5xl">Get in touch</h1>
    <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Contact the office for registration help, application follow-up or questions about membership.</p>
    <section aria-label="Organisation contact details" className="mt-8"><ContactCard /></section>
    <section className="mt-8 rounded-xl border border-border bg-card p-6 sm:p-8"><h2 className="text-xl font-semibold">Following up on an application?</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Give the name and email address you used to apply. Please contact the office rather than submit another application. Do not send passwords or payment details.</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Use a phone link to call or the email link to open your email app. This website does not send a message on your behalf.</p><div className="mt-5 flex flex-wrap gap-3"><Button asChild><Link to="/register">Membership application</Link></Button><Button variant="outline" asChild><Link to="/faqs">Browse FAQs</Link></Button></div></section>
  </div></PublicLayout>;
}
