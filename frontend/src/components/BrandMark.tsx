export default function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-rose-800 text-white shadow-sm shadow-rose-900/20 ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-[62%] w-[62%]" fill="none">
        <path
          d="M7 16h4.2l1.6-4.2 2.4 8.4 2-4.2H25"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
      </svg>
    </span>
  )
}
