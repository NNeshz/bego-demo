// Placeholder home. The real "¿Dónde descargas?" screen is built in Phase 4.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">No regreses vacío.</h1>
      <p className="text-muted-foreground">
        Dinos dónde descargas y te recomendamos la mejor carga de regreso a tu base.
      </p>
    </main>
  );
}
