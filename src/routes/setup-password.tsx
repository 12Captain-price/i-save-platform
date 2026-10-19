import { createFileRoute } from '@tanstack/react-router';
import { UnavailableAccountPage } from '@/components/auth/UnavailableAccountPage';
export const Route = createFileRoute('/setup-password')({
  head: () => ({ meta: [{ title: 'Set your password — i-Save' }] }),
  component: () => <UnavailableAccountPage title="Set your password" />,
});
