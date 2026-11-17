/** "Step 3 of 6 · Add what you sell" with a bar. Shared by sign-up (step 1) and the setup wizard. */
export function SetupProgress({ step, total, label }: { step: number; total: number; label: string }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div>
      <p className="flex justify-between text-sm font-medium text-[#5B6B64]">
        <span>Step {step} of {total}</span>
        <span>{label}</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EFE6D3]" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={total} aria-label={`Setup step ${step} of ${total}`}>
        <div className="h-full rounded-full bg-[#0B7A6B] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
