import { createFileRoute } from '@tanstack/react-router';
import { UnavailableAccountPage } from '@/components/auth/UnavailableAccountPage';
export const Route = createFileRoute('/recovery')({
  head: () => ({ meta: [{ title: 'Account recovery — i-Save' }] }),
  component: () => <UnavailableAccountPage title="Account recovery" />,
});
