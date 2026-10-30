/** Kept apart from RecentPages so the pen button and the coach mark load no notebook code. */
/** The notebook's own icon (a notebook with a pen), the same drawing as the lesson reading tools use. */
export function NotebookPenIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 3h12v18H5z" />
      <path d="M9 3v18" />
      <path d="M12.5 14.5l4.5-4.5 2 2-4.5 4.5h-2z" />
    </svg>
  );
}
