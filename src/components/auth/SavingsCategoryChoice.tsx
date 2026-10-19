import { Building2, Plane, Shield, Briefcase, GraduationCap, Check } from 'lucide-react';
import { savingsInterest } from '@/lib/savings-interest';
const icons = [Building2, Plane, Shield, Briefcase, GraduationCap];

export function SavingsCategoryChoice({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}) {
  const selected = savingsInterest.categories.find(category=>category.id===value);
  return <fieldset disabled={disabled} aria-describedby="savings-interest-guidance" className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
    <legend className="px-2 text-lg font-semibold">Choose your savings goal <span className="text-sm font-normal text-muted-foreground">(optional)</span></legend>
    <p id="savings-interest-guidance" className="text-sm leading-relaxed text-muted-foreground">You can tell us your preferred savings category alongside your membership application. This is an expression of interest, separate from membership registration and formal plan approval.</p>
    <div className="grid gap-3 sm:grid-cols-2">{savingsInterest.categories.map((category,index)=>{
      const Icon=icons[index]!;return <label key={category.id} className={`relative flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring ${value===category.id?'border-primary bg-primary/10':'border-border bg-background hover:border-primary/50'} ${disabled?'cursor-wait opacity-70':''}`}>
        <input type="radio" name="preferred_category" value={category.id} checked={value===category.id} onChange={()=>onChange(category.id)} aria-label={category.label} className="sr-only" />
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true"/><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 font-semibold">{category.label}{value===category.id&&<Check className="h-4 w-4 text-primary" aria-hidden="true"/>}</span><span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{category.purpose}</span>{value===category.id&&<span className="mt-2 block text-xs font-semibold text-primary">Selected</span>}</span>
      </label>;
    })}</div>
    {selected ? <section aria-live="polite" aria-label="Selected category information" className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-4"><h2 className="font-semibold">{selected.label}: preferred savings category</h2><p className="text-sm">{selected.purpose}</p><p className="text-sm font-semibold text-primary">{savingsInterest.notice}</p><p className="text-sm leading-relaxed text-muted-foreground">{savingsInterest.rules}</p><p className="text-xs text-muted-foreground">Information version: {savingsInterest.version}. No terms acceptance is requested or recorded.</p><button type="button" className="rounded text-sm text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>onChange('')}>Continue without a category</button><input type="hidden" name="interest_notice_version" value={savingsInterest.version}/></section> : <p className="text-xs text-muted-foreground">Select a category to read its purpose and the current information. You can register without choosing one.</p>}
  </fieldset>;
}
