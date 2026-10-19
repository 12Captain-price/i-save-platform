import { useAuth } from '@/components/auth/AuthProvider';
import { RegistrationForm } from './Registration';

export function AssistedRegistration() {
  const auth = useAuth();
  if (!auth.identity || !['staff','admin'].includes(auth.identity.workspace ?? '') || !auth.identity.permissions.includes('applications:assist')) {
    return <section role="alert" className="rounded-xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">Access denied</h2><p className="mt-3 text-sm text-muted-foreground">Assisted submission requires a separate permission. Ask an administrator to review your access.</p></section>;
  }
  return <RegistrationForm assisted onAccessChange={auth.refresh}/>;
}
