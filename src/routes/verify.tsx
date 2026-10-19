import { createFileRoute } from '@tanstack/react-router';
import { UnavailableAccountPage } from '@/components/auth/UnavailableAccountPage';
export const Route = createFileRoute('/verify')({
  head: () => ({ meta: [{ title: 'Email verification — i-Save' }] }),
  component: () => <UnavailableAccountPage title="Email verification" />,
});
