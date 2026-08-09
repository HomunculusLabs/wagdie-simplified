export default function LoreLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1920px] space-y-8 px-4 pb-28 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">Loading Archive records</span>
      <div className="relative min-h-[32rem] animate-pulse overflow-hidden border-x border-b border-midnight-light/60 bg-midnight/70 motion-reduce:animate-none sm:min-h-[42rem] lg:min-h-[50rem]">
        <div className="absolute inset-x-8 top-16 mx-auto h-20 max-w-xl bg-midnight-light/45" />
        <div className="absolute inset-x-8 bottom-10 h-52 max-w-3xl border border-midnight-light/60 bg-black/40" />
      </div>
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
