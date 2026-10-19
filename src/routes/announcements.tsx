import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Megaphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/announcements')({
  head: () => ({ meta: [
    { title: 'Announcements — i-Save news and updates' },
    { name: 'description', content: 'Latest i-Save announcements and news for members.' },
  ] }),
  component: Announcements,
});

function Announcements() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-5 w-5 text-portal-accent" />
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Announcements</p>
          </div>
          <h1 className="text-4xl font-bold sm:text-5xl">News and updates</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Stay informed about the latest from the i-Save organisation.
          </p>
        </div>

        <div className="space-y-6">
          <Card className="rounded-xl border border-border bg-card p-6">
            <CardHeader>
              <CardTitle>Your recorded contributions</CardTitle>
              <p className="text-sm text-muted-foreground">Please keep your office receipt when making a contribution. Contact the team if a recorded payment needs checking.</p>
            </CardHeader>
          </Card>
        </div>

        <div className="mt-12 rounded-md border border-border bg-secondary/5 p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Sample announcements</h3>
          <p className="text-sm text-muted-foreground">
            Announcements are managed through the Admin Centre and appear here for demonstration purposes.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
