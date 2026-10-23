import { createFileRoute } from '@tanstack/react-router';
import { Recovery } from '@/components/auth/Recovery';
export const Route = createFileRoute('/recovery')({
  head: () => ({ meta: [{ title: 'Account recovery — i-Save' }] }),
  component: Recovery,
});
