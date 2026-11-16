/** Fixed disclaimer required on every screen: this is a personal concept, not a BeGo product. */
export function UnofficialBanner() {
  return (
    <div
      role="note"
      className="sticky top-0 z-50 w-full bg-foreground px-3 py-1.5 text-center text-xs font-medium text-background"
    >
      Concepto no oficial por Neftalí Hernández · no afiliado a BeGo
    </div>
  );
}
