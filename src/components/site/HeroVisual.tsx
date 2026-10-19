const BARS = [22, 30, 36, 44, 52, 58, 68, 78, 88];

/** Abstract composition: rising contributions toward a long-term goal line. Illustrative only. */
export function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative aspect-[4/5] w-full max-w-md sm:aspect-square">
      <div className="absolute inset-0 grid-lines opacity-60" />
      <div className="absolute inset-x-6 top-[14%] border-t border-dashed border-primary/60">
        <span className="absolute -top-3 right-0 bg-background px-2 font-display text-[11px] uppercase tracking-[0.2em] text-primary">
          Goal
        </span>
      </div>
      <div className="absolute inset-x-6 bottom-10 top-[20%] flex items-end gap-2 sm:gap-3">
        {BARS.map((h, i) => {
          const isLast = i === BARS.length - 1;
          return (
            <div
              key={i}
              className={`${isLast ? "animate-grow-settle" : "animate-grow"} flex-1 rounded-t-sm ${isLast ? "bg-primary" : i > 5 ? "bg-foreground/80" : "bg-secondary border border-border"}`}
              style={{ height: `${h}%`, animationDelay: `${0.3 + i * 0.08}s` }}
            />
          );
        })}
      </div>
      <div className="absolute inset-x-6 bottom-10 border-t border-border" />
      <div className="animate-drift absolute -left-2 top-[38%] border border-border bg-card/90 px-4 py-3 shadow-lift backdrop-blur sm:-left-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Each contribution</p>
        <p className="font-display text-lg font-semibold">recorded &amp; visible</p>
      </div>
      <div className="absolute -bottom-2 right-0 h-24 w-24 rounded-full border border-primary/40" />
      <div className="absolute bottom-5 right-[18px] h-14 w-14 rounded-full bg-primary-soft" />
    </div>
  );
}
