import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FileText, Edit2, Trash2, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDemo } from './DemoProvider';
import { PageHeading, SectionHeading, DataTable, Cell, Status, Modal, Field, Notice, Empty, inputClass, textareaClass } from './PortalUI';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { teamMembers, events, faqs, contactInfo, siteContent, type TeamMember, type Event, type FAQ, type ContactInfo, type SiteContent } from '@/lib/portal/demo';

export function AdminContentManagement() {
  const { team, events: evts, faqs: faqsList, contact, content, setTeam, setTeamStatus, addTeam, updateTeam, removeTeam, setEvents, setEventStatus, addEvent, updateEvent, removeEvent, setFaqs, addFaq, updateFaq, removeFaq, reorderFaqs, setContact, updateContact, setContent, updateContent } = useDemo();
  const [activeTab, setActiveTab] = useState<'content' | 'faqs' | 'team' | 'events' | 'contact'>('content');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const publishedTeam = team.filter(t => t.published).sort((a, b) => a.order - b.order);
  const publishedEvents = evts.filter(e => e.published).sort((a, b) => a.date.localeCompare(b.date));
  const publishedFaqs = faqsList.filter(f => f.published).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Site Content Management"
        title="Manage public website content"
        description="Edit public-facing content without touching source code. Changes apply to the current session only."
      />

      <div className="flex gap-2 border-b border-border pb-4">
        <Button variant={activeTab === 'content' ? 'default' : 'outline'} onClick={() => setActiveTab('content')} className="text-sm">
          <FileText className="mr-2 h-4 w-4" />Content
        </Button>
        <Button variant={activeTab === 'faqs' ? 'default' : 'outline'} onClick={() => setActiveTab('faqs')} className="text-sm">
          <Edit2 className="mr-2 h-4 w-4" />FAQs
        </Button>
        <Button variant={activeTab === 'team' ? 'default' : 'outline'} onClick={() => setActiveTab('team')} className="text-sm">Team</Button>
        <Button variant={activeTab === 'events' ? 'default' : 'outline'} onClick={() => setActiveTab('events')} className="text-sm">Events</Button>
        <Button variant={activeTab === 'contact' ? 'default' : 'outline'} onClick={() => setActiveTab('contact')} className="text-sm">Contact</Button>
      </div>

      {activeTab === 'content' && <ContentSection content={content} setContent={setContent} updateContent={updateContent} />}
      {activeTab === 'faqs' && <FaqsSection faqs={faqsList} setFaqs={setFaqs} addFaq={addFaq} updateFaq={updateFaq} removeFaq={removeFaq} reorderFaqs={reorderFaqs} open={open} editing={editing} setOpen={setOpen} setEditing={setEditing} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} />}
      {activeTab === 'team' && <TeamSection team={team} setTeam={setTeam} setTeamStatus={setTeamStatus} addTeam={addTeam} updateTeam={updateTeam} removeTeam={removeTeam} open={open} editing={editing} setOpen={setOpen} setEditing={setEditing} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} />}
      {activeTab === 'events' && <EventsSection events={evts} setEvents={setEvents} setEventStatus={setEventStatus} addEvent={addEvent} updateEvent={updateEvent} removeEvent={removeEvent} open={open} editing={editing} setOpen={setOpen} setEditing={setEditing} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} />}
      {activeTab === 'contact' && <ContactSection contact={contact} setContact={setContact} updateContact={updateContact} />}

      <GenericModal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit item' : 'Add new item'}
        onSave={() => {}}
      />
    </div>
  );
}

function ContentSection({ content, setContent, updateContent }: { content: SiteContent[]; setContent: (c: SiteContent[]) => void; updateContent: (id: string, value: string) => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  return (
    <div className="space-y-6">
      {content.map((item) => (
        <Card key={item.id} className="rounded-xl border border-border bg-card p-6">
          <CardHeader>
            <CardTitle>{item.section} — {item.key}</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={edits[item.id] ?? item.value}
              onChange={e => setEdits({ ...edits, [item.id]: e.target.value })}
              className="w-full min-h-24 rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                updateContent(item.id, edits[item.id] ?? item.value);
                setEdits({ ...edits, [item.id]: '' });
              }}
              className="mt-4"
            >
              Save
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FaqsSection({ faqs: faqsList, setFaqs, addFaq, updateFaq, removeFaq, reorderFaqs, open, editing, setOpen, setEditing, deleteConfirm, setDeleteConfirm }: { faqs: FAQ[]; setFaqs: (f: FAQ[]) => void; addFaq: (f: Omit<FAQ, 'id'>) => void; updateFaq: (id: string, u: Partial<FAQ>) => void; removeFaq: (id: string) => void; reorderFaqs: (ids: string[]) => void; open: boolean; editing: any; setOpen: (o: boolean) => void; setEditing: (e: any) => void; deleteConfirm: string | null; setDeleteConfirm: (d: string | null) => void }) {
  const [newFaq, setNewFaq] = useState({ question: '', answer: '', category: 'General' });
  return (
    <div className="space-y-6">
      <SectionHeading title="Frequently Asked Questions" />
      <div className="grid gap-6 md:grid-cols-3">
        {faqsList.map((faq) => (
          <Card key={faq.id} className="rounded-xl border border-border bg-card p-6 flex flex-col">
            <div className="flex-1">
              <p className="text-sm font-semibold">{faq.question}</p>
              <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
              <p className="mt-3 text-xs text-muted-foreground">{faq.category} · Order {faq.order}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => { setEditing(faq); setOpen(true); }}>Edit</Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(faq.id)}>Remove</Button>
            </div>
          </Card>
        ))}
        {faqsList.length === 0 && <Empty text="No FAQs." />}
      </div>

      <SectionHeading title="Add new FAQ" />
      <form className="space-y-4 max-w-lg" onSubmit={e => {
        e.preventDefault();
        addFaq({ question: newFaq.question, answer: newFaq.answer, category: newFaq.category, order: faqsList.length + 1, published: true });
        setNewFaq({ question: '', answer: '', category: 'General' });
      }}>
        <Field label="Question"><input required name="question" value={newFaq.question} onChange={e => setNewFaq({ ...newFaq, question: e.target.value })} className={inputClass} /></Field>
        <Field label="Answer"><textarea required name="answer" value={newFaq.answer} onChange={e => setNewFaq({ ...newFaq, answer: e.target.value })} className={textareaClass} /></Field>
        <Field label="Category"><input required name="category" value={newFaq.category} onChange={e => setNewFaq({ ...newFaq, category: e.target.value })} className={inputClass} /></Field>
        <Button type="submit" className="w-full">Add FAQ</Button>
      </form>

      {deleteConfirm && (
        <Modal open={deleteConfirm === 'confirm'} onClose={() => setDeleteConfirm(null)} title="Remove FAQ" description="This action cannot be undone.">
          <Button variant="destructive" onClick={() => { removeFaq(deleteConfirm); setDeleteConfirm(null); }}>Remove</Button>
          <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
        </Modal>
      )}
    </div>
  );
}

function TeamSection({ team, setTeam, setTeamStatus, addTeam, updateTeam, removeTeam, open, editing, setOpen, setEditing, deleteConfirm, setDeleteConfirm }: { team: TeamMember[]; setTeam: (t: TeamMember[]) => void; setTeamStatus: (id: string, p: boolean) => void; addTeam: (m: Omit<TeamMember, 'id'>) => void; updateTeam: (id: string, u: Partial<TeamMember>) => void; removeTeam: (id: string) => void; open: boolean; editing: any; setOpen: (o: boolean) => void; setEditing: (e: any) => void; deleteConfirm: string | null; setDeleteConfirm: (d: string | null) => void }) {
  const [newMember, setNewMember] = useState({ name: '', role: '', bio: '', image: '' });
  return (
    <div className="space-y-6">
      <SectionHeading title="Team profiles" />
      <div className="grid gap-6 md:grid-cols-3">
        {team.map((member) => (
          <Card key={member.id} className="rounded-xl border border-border bg-card p-6 flex flex-col">
            <div className="flex-1">
              <p className="text-sm font-semibold">{member.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{member.role}</p>
              <p className="mt-2 text-xs text-muted-foreground">{member.bio}</p>
              <p className="mt-3 text-xs text-muted-foreground">{member.published ? 'Published' : 'Unpublished'}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => { setEditing(member); setOpen(true); }}>Edit</Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(member.id)}>Remove</Button>
              <Button variant="outline" size="sm" onClick={() => setTeamStatus(member.id, !member.published)}>{member.published ? 'Unpublish' : 'Publish'}</Button>
            </div>
          </Card>
        ))}
        {team.length === 0 && <Empty text="No team members." />}
      </div>

      <SectionHeading title="Add new team member" />
      <form className="space-y-4 max-w-lg" onSubmit={e => {
        e.preventDefault();
        addTeam({ name: newMember.name, role: newMember.role, bio: newMember.bio, image: newMember.image, order: team.length + 1, published: true });
        setNewMember({ name: '', role: '', bio: '', image: '' });
      }}>
        <Field label="Name"><input required name="name" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} className={inputClass} /></Field>
        <Field label="Role"><input required name="role" value={newMember.role} onChange={e => setNewMember({ ...newMember, role: e.target.value })} className={inputClass} /></Field>
        <Field label="Bio"><textarea required name="bio" value={newMember.bio} onChange={e => setNewMember({ ...newMember, bio: e.target.value })} className={textareaClass} /></Field>
        <Field label="Image URL"><input name="image" value={newMember.image} onChange={e => setNewMember({ ...newMember, image: e.target.value })} className={inputClass} placeholder="https://..." /></Field>
        <Button type="submit" className="w-full">Add team member</Button>
      </form>
    </div>
  );
}

function EventsSection({ events: evts, setEvents, setEventStatus, addEvent, updateEvent, removeEvent, open, editing, setOpen, setEditing, deleteConfirm, setDeleteConfirm }: { events: Event[]; setEvents: (e: Event[]) => void; setEventStatus: (id: string, p: boolean) => void; addEvent: (e: Omit<Event, 'id'>) => void; updateEvent: (id: string, u: Partial<Event>) => void; removeEvent: (id: string) => void; open: boolean; editing: any; setOpen: (o: boolean) => void; setEditing: (e: any) => void; deleteConfirm: string | null; setDeleteConfirm: (d: string | null) => void }) {
  const [newEvent, setNewEvent] = useState({ title: '', date: '', description: '', category: '', image: '' });
  return (
    <div className="space-y-6">
      <SectionHeading title="Events" />
      <div className="grid gap-6 md:grid-cols-3">
        {evts.map((event) => (
          <Card key={event.id} className="rounded-xl border border-border bg-card p-6 flex flex-col">
            <div className="flex-1">
              <p className="text-sm font-semibold">{event.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{event.category}</p>
              <p className="mt-2 text-xs text-muted-foreground">{new Date(event.date).toLocaleDateString()}</p>
              <p className="mt-2 text-xs text-muted-foreground">{event.published ? 'Published' : 'Unpublished'}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => { setEditing(event); setOpen(true); }}>Edit</Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(event.id)}>Remove</Button>
              <Button variant="outline" size="sm" onClick={() => setEventStatus(event.id, !event.published)}>{event.published ? 'Unpublish' : 'Publish'}</Button>
            </div>
          </Card>
        ))}
        {evts.length === 0 && <Empty text="No events." />}
      </div>

      <SectionHeading title="Add new event" />
      <form className="space-y-4 max-w-lg" onSubmit={e => {
        e.preventDefault();
        addEvent({ title: newEvent.title, date: newEvent.date, description: newEvent.description, category: newEvent.category, image: newEvent.image, published: true });
        setNewEvent({ title: '', date: '', description: '', category: '', image: '' });
      }}>
        <Field label="Title"><input required name="title" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} className={inputClass} /></Field>
        <Field label="Date"><input type="date" required name="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} className={inputClass} /></Field>
        <Field label="Category"><input required name="category" value={newEvent.category} onChange={e => setNewEvent({ ...newEvent, category: e.target.value })} className={inputClass} /></Field>
        <Field label="Description"><textarea required name="description" value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} className={textareaClass} /></Field>
        <Field label="Image URL"><input name="image" value={newEvent.image} onChange={e => setNewEvent({ ...newEvent, image: e.target.value })} className={inputClass} placeholder="https://..." /></Field>
        <Button type="submit" className="w-full">Add event</Button>
      </form>
    </div>
  );
}

function ContactSection({ contact, setContact, updateContact }: { contact: ContactInfo[]; setContact: (c: ContactInfo[]) => void; updateContact: (id: string, value: string) => void }) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Contact details" />
      <div className="space-y-4">
        {contact.map((item) => (
          <div key={item.id} className="flex items-center gap-4 p-4 rounded-md border border-border bg-card">
            <span className="w-20 text-sm font-medium">{item.label}</span>
            <input
              value={item.value}
              onChange={e => updateContact(item.id, e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">{item.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericModal({ open, onClose, title, onSave }: { open: boolean; onClose: () => void; title: string; onSave: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} description="Demo content management.">
      <p className="text-sm text-muted-foreground">Use the specific edit forms above to manage content.</p>
    </Modal>
  );
}
