import { useId } from 'react';

/** 装飾を外して初期値に戻す（T に右上がりの打ち消し線。線が交わるところは T 側を切り欠く） */
export function ClearFormatIcon({ className }: { className?: string }) {
  // 同じ画面に複数置いても mask の id がぶつからないようにする
  const maskId = useId();
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect width="24" height="24" fill="white" />
          <path
            d="M7 21L21 3"
            stroke="black"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 5h14M12 5v14M9 19h6" mask={`url(#${maskId})`} />
        <path d="M7 21L21 3" />
      </g>
    </svg>
  );
}
