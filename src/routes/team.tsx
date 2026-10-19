import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { teamMembers } from '@/lib/portal/demo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/team')({
  head: () => ({ meta: [
    { title: 'Meet the Team — i-Save team members' },
    { name: 'description', content: 'Meet the i-Save team. Sample profiles for presentation purposes.' },
  ] }),
  component: Team,
});

function Team() {
  const published = teamMembers.filter(t => t.published).sort((a, b) => a.order - b.order);
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Meet the team</p>
          <h1 className="text-4xl font-bold sm:text-5xl">The people behind i-Save.</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Get to know the team supporting members and running the organisation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {published.map(member => (
            <Card key={member.id} className="rounded-xl border border-border bg-card flex flex-col h-full">
              <div className="h-48 overflow-hidden rounded-t-xl">
                <img
                  src={member.image}
                  alt={member.name}
                  className="h-48 w-full object-cover"
                />
              </div>
              <CardHeader>
                <CardTitle>{member.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground">{member.bio}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 rounded-md border border-border bg-secondary/5 p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Sample profiles</h3>
          <p className="text-sm text-muted-foreground">
            The people shown here are sample profiles used for presentation purposes. They do not represent actual staff or leadership of the organisation.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
