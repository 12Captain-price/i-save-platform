
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { isRole, validScreen, screenTitle, navigation, type Role, canAccessWorkspace } from '@/lib/portal/demo';
import { PortalShell, Notice, WORKSPACE_LABELS } from '@/components/portal/PortalUI';
import { AccountLayout, AccountForm } from '@/components/portal/AccountLayout';
import { useDemo } from '@/components/portal/DemoProvider';
import { MemberScreens } from '@/components/portal/MemberScreens';
import { StaffScreens } from '@/components/portal/StaffScreens';
import { FinanceScreens } from '@/components/portal/FinanceScreens';
import { AdminScreens } from '@/components/portal/AdminScreens';

export const Route = createFileRoute('/portal/$role/$screen')({
  validateSearch: (
    search: Record<string, unknown>
  ): { member?: string; plan?: string } => {
    const member = search['member'];
    const plan = search['plan'];
    return { ...(typeof member === 'string' ? { member } : {}), ...(typeof plan === 'string' ? { plan } : {}) };
  },

  beforeLoad: ({ params }) => {
    if (!isRole(params.role) || !validScreen(params.role, params.screen)) {
      throw notFound();
    }
  },

  head: ({ params }) => {
    const name = isRole(params.role)
      ? `${screenTitle(params.role, params.screen)} · ${params.role} portal`
      : 'Portal unavailable';

    const description = `Explore ${name} in the i-Save visual demonstration. Sample data only; no real accounts or financial transactions.`;

    return {
      meta: [
        { title: `i-Save — ${name}` },
        { name: 'description', content: description },
        { property: 'og:title', content: `i-Save — ${name}` },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
    };
  },

  component: PortalScreen,
});

const publicScreens = ['login', 'register', 'recovery', 'verify', 'setup-password'];

function PortalScreen() {
  const { role: roleRaw, screen } = Route.useParams();
  const role: Role = isRole(roleRaw) ? roleRaw : 'member';
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { currentUser } = useDemo();
  const [accessDenied, setAccessDenied] = useState<Role | null>(null);

  useEffect(() => {
    if (!currentUser && !publicScreens.includes(screen)) {
      navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'login' } });
      return;
    }

    if (currentUser && publicScreens.includes(screen)) {
      const defaultScreen = navigation[currentUser.role]?.[0]?.id ?? 'dashboard';
      navigate({ to: '/portal/$role/$screen', params: { role: currentUser.role, screen: defaultScreen } });
      return;
    }

    if (currentUser && role !== currentUser.role && !canAccessWorkspace(currentUser, role)) {
      setAccessDenied(role);
      const defaultScreen = navigation[currentUser.role]?.[0]?.id ?? 'dashboard';
      navigate({ to: '/portal/$role/$screen', params: { role: currentUser.role, screen: defaultScreen } });
      return;
    }

    setAccessDenied(null);
  }, [currentUser, role, screen, navigate]);

  if (!isRole(role)) {
    return null;
  }

  if (!currentUser && publicScreens.includes(screen)) {
    return <AccountLayout><AccountForm screen={screen} /></AccountLayout>;
  }

  return (
    <PortalShell role={role} screen={screen}>
      {accessDenied && (
        <Notice>
          Access denied — your account is not authorised to enter the <span className="font-semibold">{WORKSPACE_LABELS[accessDenied].label}</span> workspace. You have been returned to your own dashboard.
        </Notice>
      )}
      {!accessDenied && (
        <>
          {role === 'member' ? (
            <MemberScreens screen={screen} search={search} />
          ) : role === 'staff' ? (
            <StaffScreens
              screen={screen}
              memberId={search.member ?? 'IS-1042'}
            />
          ) : role === 'finance' ? (
            <FinanceScreens screen={screen} />
          ) : (
            <AdminScreens screen={screen} />
          )}
        </>
      )}
    </PortalShell>
  );
}
