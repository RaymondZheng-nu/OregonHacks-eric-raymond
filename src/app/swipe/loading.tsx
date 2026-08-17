export default function SwipeLoading() {
  return (
    <div className="flex h-[100dvh] w-full flex-col">
      <div className="flex h-[57px] items-center justify-between border-b bg-background px-4 md:px-6">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="aspect-3/4 w-full max-w-sm animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
