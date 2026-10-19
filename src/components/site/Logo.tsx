const logoAsset = '/images/isave-logo-dark.png';
/** Official i-Save logo (dark-background version, best contrast on the site's dark surfaces). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <a href="#top" aria-label="iSave home" className={`inline-flex items-center ${className}`}>
      <img
        src={logoAsset}
        alt="i-Save — Saving today for a better tomorrow"
        width={1983}
        height={793}
        className="h-9 w-auto"
      />
    </a>
  );
}
