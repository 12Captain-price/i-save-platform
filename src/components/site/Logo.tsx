const logoAsset = "/images/isave-logo-dark.png";
/** Official i-Save logo (dark-background version, best contrast on the site's dark surfaces). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <a href="/" aria-label="iSave home" className={`inline-flex items-center ${className}`}>
      <img
        src={logoAsset}
        alt="i-Save — Saving today for a better tomorrow"
        width={1983}
        height={793}
        className="h-10 w-auto max-w-[155px] object-contain"
      />
    </a>
  );
}
