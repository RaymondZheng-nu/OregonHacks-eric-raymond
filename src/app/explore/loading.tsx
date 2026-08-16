export default function ExploreLoading() {
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex h-[65px] items-center justify-between border-b bg-background px-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" />
        </div>
      </header>
      <div className="flex-1 animate-pulse bg-muted" />
    </div>
  );
}
