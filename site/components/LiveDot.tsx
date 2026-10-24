export function LiveDot({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-semibold">
      <span className={`h-3.5 w-3.5 rounded-full ${live ? 'bg-green-600' : 'bg-red-600'}`} aria-hidden />
      {live ? 'Live' : 'Reconnecting'}
    </span>
  );
}
