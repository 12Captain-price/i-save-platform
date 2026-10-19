import { createFileRoute, Outlet } from '@tanstack/react-router';
import { DemoProvider } from '@/components/portal/DemoProvider';
export const Route = createFileRoute('/portal')({ component: PortalLayout });
function PortalLayout() { return <DemoProvider><Outlet /></DemoProvider>; }
