import fs from "fs";
import path from "path";

/**
 * The Harbor Haven logo, with a graceful fallback: if the real logo file has
 * been dropped at public/brand/logo.jpg (or .png/.webp), render it; until
 * then, render the text wordmark. Server component — the file check runs at
 * render time, so adding the file needs no code change.
 */
const CANDIDATES = ["logo.jpg", "logo.png", "logo.webp"];

function findLogo(): string | null {
  for (const name of CANDIDATES) {
    if (fs.existsSync(path.join(process.cwd(), "public", "brand", name))) {
      return `/brand/${name}`;
    }
  }
  return null;
}

export function Logo({ size = 56, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  const src = findLogo();
  if (src) {
    return (
      <span className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Harbor Haven Home Watch" width={size} height={size} className="rounded-lg" style={{ maxWidth: size, height: "auto" }} />
        {withWordmark && (
          <span className="leading-tight">
            <span className="block font-bold text-[var(--hh-harbor)]">Harbor Haven</span>
            <span className="block text-sm font-semibold tracking-widest text-[var(--hh-accent-dark)]">HOME WATCH</span>
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="leading-tight">
      <span className="block text-xl font-bold text-[var(--hh-harbor)]">Harbor Haven</span>
      <span className="block text-sm font-semibold tracking-widest text-[var(--hh-accent-dark)]">HOME WATCH</span>
    </span>
  );
}
