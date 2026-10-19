import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { events } from '@/lib/portal/demo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Users, Building2 } from 'lucide-react';

const CATEGORY_ICONS: Record<string, typeof Calendar> = {
  Workshop: Calendar,
  Meeting: Users,
  Seminar: Building2,
};

export const Route = createFileRoute('/events')({
  head: () => ({ meta: [
    { title: 'Events — i-Save upcoming events and activities' },
    { name: 'description', content: 'View upcoming i-Save events, workshops and meetings.' },
  ] }),
  component: Events,
});

function Events() {
  const published = events.filter(e => e.published).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Events</p>
          <h1 className="text-4xl font-bold sm:text-5xl">Upcoming events</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Join our workshops, meetings and seminars for members and the community.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {published.map(event => {
            const EventIcon = CATEGORY_ICONS[event.category] || Calendar;
            return (
              <Card key={event.id} className="rounded-xl border border-border bg-card flex flex-col h-full group">
                <div className="h-48 overflow-hidden rounded-t-xl group-hover:scale-105 transition-transform duration-300">
                  <img src={event.image} alt={event.title} className="h-full w-full object-cover" />
                </div>
              <CardHeader className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <EventIcon className="h-4 w-4 text-portal-accent" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase">{event.category}</span>
                </div>
                <CardTitle className="text-lg">{event.title}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{event.description}</p>
              </CardHeader>
              <CardContent className="py-4 pt-0">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>{new Date(event.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>

        {published.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm text-muted-foreground">No upcoming events at this time.</p>
          </div>
        )}

        <div className="mt-12 rounded-md border border-border bg-secondary/5 p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Sample events</h3>
          <p className="text-sm text-muted-foreground">
            The events shown here are sample content used for presentation purposes. They do not represent actual scheduled events.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
