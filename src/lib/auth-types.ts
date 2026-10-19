export type Workspace = 'member' | 'staff' | 'finance' | 'admin';
export type Identity = {
  user: { id: number; email: string; is_active: boolean; role_id: number | null };
  workspace: Workspace | null;
  permissions: string[];
};
export const isWorkspace = (value: unknown): value is Workspace =>
  typeof value === 'string' && ['member', 'staff', 'finance', 'admin'].includes(value);
