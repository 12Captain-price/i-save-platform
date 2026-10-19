import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceEntry } from '@/components/portal/AuthenticatedWorkspace';
export const Route = createFileRoute('/portal/')({
  head: () => ({ meta: [{ title: 'i-Save — Your workspace' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: WorkspaceEntry,
});