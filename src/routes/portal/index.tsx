import { createFileRoute } from '@tanstack/react-router';
import { PortalEntry } from '@/components/portal/PortalEntry';
export const Route = createFileRoute('/portal/')({
  head: () => ({ meta: [
    { title: 'i-Save — Explore the Member, Staff & Finance portals' },
    { name: 'description', content: 'Explore the i-Save visual prototype with Member, Staff and Finance demonstration workspaces. No credentials or real transactions.' },
    { property: 'og:title', content: 'i-Save — Portal demonstration' },
    { property: 'og:description', content: 'Explore Member, Staff and Finance workspaces with clearly labelled sample records.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: PortalEntry,
});