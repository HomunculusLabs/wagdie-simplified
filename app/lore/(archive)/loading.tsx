export default function LoreLoading() {
  return (
    <main className="container mx-auto min-h-screen max-w-7xl space-y-8 px-4 py-8 md:py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">Loading Archive records</span>
      <div className="h-4 w-28 animate-pulse bg-arcane-muted/35 motion-reduce:animate-none" />
      <div className="h-14 max-w-2xl animate-pulse bg-midnight-light/70 motion-reduce:animate-none" />
      <div className="h-20 max-w-3xl animate-pulse bg-midnight/70 motion-reduce:animate-none" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-24 animate-pulse border border-midnight-light/60 bg-midnight/50 motion-reduce:animate-none" />
        <div className="h-24 animate-pulse border border-midnight-light/60 bg-midnight/50 motion-reduce:animate-none" />
      </div>
      <div className="h-32 animate-pulse border-y border-midnight-light/60 bg-midnight/30 motion-reduce:animate-none" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="aspect-[4/3] animate-pulse border border-midnight-light/60 bg-midnight/50 motion-reduce:animate-none" />
        ))}
      </div>
    </main>
  );
}
