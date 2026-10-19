import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicLayout, ContactCard } from '@/components/site/PublicLayout';
import { Mail, Phone, MapPin, Globe, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/contact')({
  head: () => ({ meta: [
    { title: 'Contact i-Save — Get in touch with the team' },
    { name: 'description', content: 'Contact the i-Save savings organisation for membership, savings plan and contribution enquiries.' },
  ] }),
  component: Contact,
});

function Contact() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Contact and support</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Get in touch</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Have a question about membership, savings plans or contributions? Contact the office team.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="rounded-xl border border-border bg-card p-8">
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
                <CardDescription>Complete the form and a member of the team will respond.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <form className="space-y-5" onSubmit={e => {
                  e.preventDefault();
                  alert('Message submitted (demonstration only — no message is sent externally).');
                }}>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-sm font-medium">Full name</label>
                      <input type="text" required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:border-primary" placeholder="e.g. Tariro Moyo" />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-sm font-medium">Email address</label>
                      <input type="email" required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:border-primary" placeholder="e.g. member@example.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-1 text-sm font-medium">Subject</label>
                    <input type="text" required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:border-primary" placeholder="What would you like to discuss?" />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-1 text-sm font-medium">Message</label>
                    <textarea required className="min-h-32 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-primary" placeholder="Tell us how we can help..." />
                  </div>
                  <p className="text-xs text-muted-foreground">This is a demonstration form. No message is sent externally.</p>
                  <Button type="submit" className="w-full">Send message</Button>
                </form>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-1">
            <Card className="rounded-xl border border-border bg-card p-6">
              <CardHeader>
                <CardTitle>Office details</CardTitle>
              </CardHeader>
              <CardContent>
                <ContactCard />
              </CardContent>
              <CardFooter>
                <Button variant="outline" asChild className="w-full">
                  <Link to="/faqs">Browse FAQs <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
