export function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="5"
        y="5"
        width="9"
        height="9"
        rx="1"
        stroke="#a0aec0"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M3 10.5V3C3 2.44772 3.44772 2 4 2H10.5"
        stroke="#a0aec0"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
