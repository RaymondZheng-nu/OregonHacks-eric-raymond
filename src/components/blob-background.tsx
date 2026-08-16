// Hand-authored, haikei.app-style decorative background (soft organic blob
// shapes, gradient fill) — haikei itself is an interactive generator with no
// static-export API to fetch from, so this reproduces its typical output by
// hand rather than pulling a real export. Uses the app's own green palette
// (matching the TOUCH GRASS wordmark) instead of haikei's default random
// colors, so it reads as part of this app rather than a generic backdrop.
export function BlobBackground() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="blob-a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#16a34a" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#65a30d" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="blob-b" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <path
        fill="url(#blob-a)"
        d="M-60,180 C120,40 340,-40 540,60 C740,160 700,360 560,460 C420,560 180,600 20,480 C-140,360 -180,280 -60,180 Z"
      />
      <path
        fill="url(#blob-b)"
        d="M700,540 C860,420 1080,440 1200,560 C1320,680 1260,820 1080,840 C900,860 700,800 640,700 C580,600 620,620 700,540 Z"
      />
    </svg>
  );
}
