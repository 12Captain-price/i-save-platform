import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { isRole, validScreen, screenTitle } from '@/lib/portal/navigation';
import { AuthenticatedWorkspace } from '@/components/portal/AuthenticatedWorkspace';

export const Route = createFileRoute('/portal/$role/$screen')({
  beforeLoad: ({ params }) => {
    if (!isRole(params.role) || !validScreen(params.role, params.screen)) throw notFound();
    if (params.role === 'member' && ['login','register','recovery','verify','setup-password'].includes(params.screen)) throw redirect({ href: `/${params.screen}`, replace: true });
  },
  head: ({ params }) => ({ meta: [
    { title: `i-Save — ${isRole(params.role) ? screenTitle(params.role, params.screen) : 'Workspace'}` },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: PortalScreen,
});
function PortalScreen() {
  const { role, screen } = Route.useParams();
  return isRole(role) ? <AuthenticatedWorkspace role={role} screen={screen} /> : null;
}