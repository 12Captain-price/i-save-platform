import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { money } from '@/lib/portal/demo';
import { type Payment } from '@/lib/portal/demo';

const PALETTE = ['#02F5A1', '#99CC33', '#003333', '#07191E', '#7aa8ff'];

interface SavingsTrendChartProps { payments: Payment[]; }
export function SavingsTrendChart({ payments }: SavingsTrendChartProps) {
  const buckets: Record<string, number> = {};
  payments
    .filter(p => p.kind === 'Savings contribution' && p.status === 'Verified')
    .forEach(p => { buckets[p.date] = (buckets[p.date] || 0) + p.amount; });
  const data = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }));
  return (
    <Card className="rounded-xl border border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between py-4 px-5"><CardTitle className="text-sm font-semibold">Savings trend (demo)</CardTitle></CardHeader>
      <CardContent className="pb-5 pt-0 px-5">
        <div className="h-48 w-full">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#02F5A1" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#02F5A1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Line type="monotone" dataKey="amount" stroke="#02F5A1" strokeWidth={2} fill="url(#colorSavings)" dot={false} />
          </LineChart>
        </div>
      </CardContent>
    </Card>
  );
}

interface PlanBreakdownChartProps { payments: Payment[]; }
export function PlanBreakdownChart({ payments }: PlanBreakdownChartProps) {
  const totals: Record<string, number> = {};
  payments
    .filter(p => p.kind === 'Savings contribution' && p.status === 'Verified')
    .forEach(p => { totals[p.plan] = (totals[p.plan] || 0) + p.amount; });
  const data = Object.entries(totals).map(([name, value]) => ({ name, value }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card className="rounded-xl border border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between py-4 px-5"><CardTitle className="text-sm font-semibold">Contributions by plan (demo)</CardTitle></CardHeader>
      <CardContent className="pb-5 pt-0 px-5">
        <div className="h-48 w-full flex items-center justify-center [&_.recharts-legend_text]:fill-foreground">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 5, right: 5, bottom: 36, left: 5 }}>
              <Pie dataKey="value" data={data} cx="50%" cy="50%" outerRadius={62} fill="#888" labelLine={false} label={({ name, value, percent }) => {
                const pct = total > 0 ? Math.round((Number(value) / total) * 100) : 0;
                return <text fill="#cbd5e1" fontSize={11} textAnchor="middle">{pct}%</text>;
              }}>
                {data.map((entry, index) => <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={value => money(Number(value))} />
              <Legend verticalAlign="bottom" align="center" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface StatusChartProps { payments: Payment[]; }
export function StatusChart({ payments }: StatusChartProps) {
  const verified = payments.filter(p => p.status === 'Verified').length;
  const pending = payments.filter(p => p.status === 'Pending verification').length;
  const reversed = payments.filter(p => p.status === 'Reversed').length;
  const data = [
    { name: 'Verified', value: verified, color: '#02F5A1' },
    { name: 'Pending verification', value: pending, color: '#99CC33' },
    { name: 'Reversed', value: reversed, color: '#ef4444' },
  ].filter(d => d.value > 0);
  if (data.length === 0) return null;
  return (
    <Card className="rounded-xl border border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between py-4 px-5"><CardTitle className="text-sm font-semibold">Payment status (demo)</CardTitle></CardHeader>
      <CardContent className="pb-5 pt-0 px-5">
        <div className="h-40 w-full">
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#02F5A1" />
          </BarChart>
        </div>
      </CardContent>
    </Card>
  );
}
