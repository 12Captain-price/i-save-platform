import { usePublicContacts } from '@/lib/live-public-contact';

export function RegistrationHelp({ followUp = false }: { followUp?: boolean }) {
  const {contact:publicContact,error,retry}=usePublicContacts();
  return <aside aria-label={followUp ? 'Application follow-up' : 'Registration help'} className="rounded-lg border border-primary/25 bg-primary/5 p-5 text-sm">
    <h2 className="font-semibold">{followUp ? 'Following up on your application' : 'Need help registering?'}</h2>
    <p className="mt-2 leading-relaxed text-muted-foreground">{followUp ? 'For questions or corrections, contact the office using the details below. Give the name and email address you used to apply. Please follow up rather than submit another application.' : 'If you need help completing the form, contact the office using these details. Do not send passwords or payment details.'}</p>
    {!publicContact ? <p role="status" className="mt-4">{error?'Office contact details are temporarily unavailable.':'Loading office contact details…'}{error && <button className="ml-2 underline" onClick={retry}>Retry contacts</button>}</p> : <dl className="mt-4 space-y-3">{publicContact.phones.map(phone => <div key={phone.href} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{phone.label}</dt><dd><a href={phone.href} className="rounded text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{phone.value}</a></dd></div>)}
      <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1 break-words"><a href={`mailto:${publicContact.email}`} className="rounded text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{publicContact.email}</a></dd></div>
      <div><dt className="text-muted-foreground">Office</dt><dd className="mt-1 leading-relaxed">{publicContact.office}</dd></div>
    </dl>}
  </aside>;
}
