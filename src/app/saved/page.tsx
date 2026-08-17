import Link from "next/link";
import { SavedList } from "@/components/saved-list";

export default function SavedPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-logo text-2xl tracking-tight text-green-700">Saved Spots</h1>
          <p className="text-sm text-muted-foreground">
            Spots you swiped right on — saved to this device only.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Back to home
        </Link>
      </div>

      <SavedList />
    </div>
  );
}
