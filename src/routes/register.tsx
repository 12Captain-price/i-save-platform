import { createFileRoute } from '@tanstack/react-router';
import { UnavailableAccountPage } from '@/components/auth/UnavailableAccountPage';
export const Route = createFileRoute('/register')({
  head: () => ({ meta: [{ title: 'Account registration — i-Save' }] }),
  component: () => <UnavailableAccountPage title="Account registration" />,
});
