export type FeeQuote={id:number;amount:string;currency:string;payment_options:{amount:string;currency:string}[];rate:null|{version:number;per_usd:string;source:string;effective_at:string};rounding:string;conversion_unavailable:string|null};
export const feeMoney=(amount:string,currency:string)=>(currency==='USD'?'US$':currency==='ZWG'?'ZiG ':currency+' ')+amount;
export function FeeQuoteDetails({quote}:{quote:FeeQuote|null|undefined}) {
  if(!quote)return null;
  return <div className="mt-3 space-y-2 text-sm"><p>Original obligation: <strong>{feeMoney(quote.amount,quote.currency)}</strong></p>
    <p>Exact full-payment options: {quote.payment_options.map(p=>feeMoney(p.amount,p.currency)).join(' or ')}.</p>
    {quote.rate?<p className="break-words text-xs text-muted-foreground">Captured rate version {quote.rate.version}: {quote.rate.per_usd} ZiG per USD. Original source (unchanged): {quote.rate.source} Effective {new Date(quote.rate.effective_at).toLocaleString()}. Rounded once to two decimals, half up.</p>:<p className="text-xs text-muted-foreground">{quote.conversion_unavailable}</p>}
    <p className="text-xs text-muted-foreground">This quote is frozen. Later rates do not change it. Captured source wording is historical; the effective date above confirms publication. No savings conversion.</p>
  </div>;
}
