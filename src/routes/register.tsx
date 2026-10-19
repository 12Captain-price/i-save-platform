import { createFileRoute } from '@tanstack/react-router';
import { Registration } from '@/components/auth/Registration';
export const Route = createFileRoute('/register')({
  head: () => ({ meta: [{ title: 'Account registration — i-Save' }] }),
  component: Registration,
});
