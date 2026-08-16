export default function ResultsLoading() {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4">
          <span className="font-logo text-lg tracking-tight text-green-700">
            TOUCH GRASS
          </span>
          <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8">
        <div className="mx-auto w-full max-w-md space-y-3">
          <div className="space-y-1.5">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex gap-1.5">
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="aspect-4/3 w-full animate-pulse rounded-lg bg-muted" />
          <div className="space-y-1.5">
            <div className="flex gap-1">
              <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </main>
    </div>
  );
}
