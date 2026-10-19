import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RegistrationHelp } from '@/components/site/RegistrationHelp';
import { SavingsCategoryChoice } from './SavingsCategoryChoice';
import { savingsInterest } from '@/lib/savings-interest';

export function Registration() {
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState('');
  const [preferredCategory, setPreferredCategory] = useState('');
  const selectedCategory = savingsInterest.categories.find(category=>category.id===preferredCategory);
  const sending = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (received) confirmation.current?.focus(); }, [received]);
  useEffect(() => { if (error && !busy) errorPanel.current?.focus(); }, [error, busy]);
  return <PublicLayout><div className="mx-auto max-w-2xl px-5 py-12 md:py-20"><section className="rounded-xl border border-border bg-card p-6 sm:p-9">
    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Membership application</p>
    {received ? <div className="mt-4 space-y-6"><div ref={confirmation} role="status" aria-labelledby="registration-confirmation-title" tabIndex={-1} className="rounded-lg border border-primary/30 bg-primary/5 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6">
      <h1 id="registration-confirmation-title" className="text-3xl font-semibold">Application received</h1>
      <p className="mt-4 leading-relaxed">Your application is awaiting review. This does not mean your membership has been approved.</p>
      <h2 className="mt-6 font-semibold">What happens next</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground"><li>Authorised staff review the details.</li><li>Staff may request additional information.</li><li>You receive further instructions about required checks, fee verification and account setup when those processes are available.</li></ol>
      <p className="mt-5 text-sm leading-relaxed">Submitting an application does not create a login account or confirm a payment.</p>
      {selectedCategory && <section aria-label="Submitted category preference" className="mt-5 space-y-2 rounded-lg border border-primary/25 p-4"><h2 className="font-semibold">Preference included with this submission: {selectedCategory.label}</h2><p className="text-sm text-primary">{savingsInterest.notice}</p><p className="text-sm leading-relaxed text-muted-foreground">{savingsInterest.rules}</p><p className="text-xs text-muted-foreground">Information version: {savingsInterest.version}. No plan terms were accepted. This reflects your current submission; it does not disclose or change an existing application or preference.</p></section>}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Please do not submit the form again. Repeated requests receive this same acknowledgement and do not create another application. This message does not disclose whether an application or account already exists.</p>
    </div><RegistrationHelp followUp /><Button variant="outline" asChild><Link to="/">Return to website</Link></Button></div> : <>
    <h1 className="text-3xl font-semibold">Start your application</h1>
    <div id="registration-guidance" className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground"><p>Have your first name, last name and email address ready. You may also provide a phone number, address and a short reason for applying; these are optional.</p><p>Submit your details for office review. This form does not create a login, activate membership or confirm a payment. Do not include passwords, identity documents or payment details.</p><p>Already submitted? Contact the office for help or corrections rather than submitting another application.</p></div>
    <div className="mt-6"><RegistrationHelp /></div>
    <form className="mt-7 space-y-5" aria-describedby="registration-guidance" aria-busy={busy} onSubmit={async event => {
      event.preventDefault(); if (sending.current) return;
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      sending.current = true; setBusy(true); setError('');
      try {
        const response = await fetch('/api/registration', { method:'POST', credentials:'same-origin', cache:'no-store',
          headers:{ 'Content-Type':'application/json', 'X-Isave-Request':'1' }, body:JSON.stringify(values), signal:AbortSignal.timeout(15_000) });
        if (response.status !== 202) {
          throw new Error(response.status === 429 ? 'Too many submissions. Please try again later.' : response.status === 400 ? 'Check your application details and try again.' : 'We could not confirm your submission.');
        }
        form.reset(); setReceived(true);
      } catch (cause) { setError(cause instanceof Error && cause.name === 'Error' ? cause.message : 'We could not confirm your submission.'); }
      finally { sending.current = false; setBusy(false); }
    }}>
      <SavingsCategoryChoice value={preferredCategory} onChange={setPreferredCategory} disabled={busy}/>
      <div className="grid gap-5 sm:grid-cols-2">{[['first_name','First name','given-name'],['last_name','Last name','family-name']].map(([name,label,autoComplete]) => <div key={name} className="space-y-2"><Label htmlFor={name}>{label} (required)</Label><Input id={name} name={name} autoComplete={autoComplete} required maxLength={100} disabled={busy} pattern=".*\S.*" /></div>)}</div>
      <div className="space-y-2"><Label htmlFor="registration-email">Email address (required)</Label><Input id="registration-email" name="email" type="email" autoComplete="email" required maxLength={255} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="registration-phone">Phone (optional)</Label><Input id="registration-phone" name="phone" type="tel" autoComplete="tel" maxLength={50} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="registration-address">Address (optional)</Label><Input id="registration-address" name="address" autoComplete="street-address" maxLength={255} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="registration-reason">Reason for applying (optional)</Label><textarea id="registration-reason" name="reason" rows={3} maxLength={1000} disabled={busy} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
      {error && <div ref={errorPanel} role="alert" tabIndex={-1} className="rounded-lg border border-destructive/40 p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="font-semibold text-destructive">{error}</p><p className="mt-2 leading-relaxed text-muted-foreground">Your details are still here. You can review them and retry safely; repeated requests do not create another application.</p></div>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Submitting...' : error ? 'Retry submission' : 'Submit application'}</Button>
      <p className="text-xs leading-relaxed text-muted-foreground">Fee verification and membership activation are unavailable while policy approval is pending. No payment is taken here.</p>
    </form></>}
    <p className="mt-6 text-sm text-muted-foreground">Already have a login? <Link to="/login" className="text-primary underline underline-offset-4">Log in</Link></p>
  </section></div></PublicLayout>;
}
