const paths = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  history: "M4 11a8 8 0 1 1 1.7 6.6M4 6v5h5m3-3v4l3 2",
  plus: "M12 5v14M5 12h14",
  chart: "M4 4v16h16M8 15v2m4-6v6m4-9v9m4-12v12",
  settings: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4",
  mic: "M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zm-3 6a6 6 0 0 0 12 0m-6 6v4m-3 0h6",
  edit: "M13.5 5.5l5 5M4 20l1-5L16 4a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3L9 19z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5",
  close: "m6 6 12 12M18 6 6 18",
  chevronLeft: "m15 6-6 6 6 6",
  chevronRight: "m9 6 6 6-6 6",
  calendar: "M4 6h16v14H4zm0 5h16M8 4v4m8-4v4",
  receipt: "M6 3l3 2 3-2 3 2 3-2v18l-3-2-3 2-3-2-3 2zm3 6h6m-6 4h6",
  check: "m5 12 4 4L19 6",
  sparkles: "M11 3l1.5 4.5L17 9l-4.5 1.5L11 15l-1.5-4.5L5 9l4.5-1.5zM18 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1z",
  keyboard: "M3 6h18v12H3zm4 4h.01m3.32 0h.01m3.32 0h.01M17 10h.01M7 14h.01M10 14h7",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19m11-7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  moon: "M20 15.5A8.5 8.5 0 1 1 8.5 4 8.5 8.5 0 0 0 20 15.5z",
  wifi: "M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9 16a5 5 0 0 1 6 0m-3 3h.01",
  offline: "m3 3 18 18M3 9a14 14 0 0 1 3.3-2.1M10 6a14 14 0 0 1 11 3m-15 3.5a9.5 9.5 0 0 1 4.5-1.8m4.2.2a9.5 9.5 0 0 1 3.3 1.6M9 16a5 5 0 0 1 5.7-.2M12 19h.01",
  arrowRight: "M4 12h15m-6-6 6 6-6 6",
  logout: "M10 4H5v16h5m4-12 4 4-4 4m4-4H9",
  refresh: "M20 9a8 8 0 0 0-13.7-2L4 9m0-5v5h5m-5 6a8 8 0 0 0 13.7 2l2.3-2m0 5v-5h-5",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-1.8 4.2L20 20",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
