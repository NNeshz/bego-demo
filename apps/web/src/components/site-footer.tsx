import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 pb-8 text-xs text-foreground/70 md:max-w-5xl">
      <Link href="/despacho" className="hover:text-foreground hover:underline">
        Despacho
      </Link>
      <span aria-hidden>·</span>
      <Link href="/embed" className="hover:text-foreground hover:underline">
        Widget
      </Link>
      <span aria-hidden>·</span>
      <Link href="/docs" className="hover:text-foreground hover:underline">
        API
      </Link>
      <span aria-hidden>·</span>
      <span>Datos sintéticos · costos configurables</span>
    </footer>
  );
}
