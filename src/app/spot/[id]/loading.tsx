export default function SpotLoading() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col gap-4 p-4">
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="aspect-4/3 w-full animate-pulse bg-muted" />
        <div className="space-y-2 p-4">
          <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
