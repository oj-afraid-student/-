export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    book: (
      <>
        <path d="M12 5c-3-2-7-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" />
        <path d="M12 5v15" />
      </>
    ),
    pen: (
      <>
        <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z" />
        <path d="M13 20h8" />
      </>
    ),
    history: (
      <>
        <path d="M3 10a9 9 0 1 1 1 8M3 4v6h6" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    exit: (
      <>
        <path d="M9 4H4v16h5m0-8h12m-5-5 5 5-5 5" />
      </>
    ),
    diamond: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7Z" />
        <path d="m3 7 9 5 9-5m-9 5v10m0-10V2" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2Z" />
        <path d="M12 9v5m0 3v1" />
      </>
    ),
  };
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.diamond}
    </svg>
  );
}

export function GeometryArt() {
  return (
    <svg className="geometry-art" viewBox="0 0 360 250" fill="none" aria-hidden="true">
      <circle cx="180" cy="128" r="107" stroke="currentColor" opacity=".1" />
      <ellipse
        cx="180"
        cy="128"
        rx="145"
        ry="44"
        stroke="currentColor"
        opacity=".1"
        transform="rotate(-24 180 128)"
      />
      <path d="m95 95 115-52 78 57-116 56Z" fill="currentColor" fillOpacity=".04" />
      <path
        d="m95 95 77 61v89L95 185Zm77 61 116-56v89l-116 56Z"
        fill="currentColor"
        fillOpacity=".07"
      />
      <path
        d="m95 95 115-52 78 57-116 56-77-61v90l77 60 116-56v-89m-116 56v89"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M210 43v90l-115 52m115-52 78 56"
        stroke="currentColor"
        strokeDasharray="5 5"
        opacity=".45"
      />
      <path d="m95 185 193-85m-78-57-38 202" stroke="#d09c45" strokeWidth="1.8" opacity=".8" />
      {[
        [95, 95],
        [210, 43],
        [288, 100],
        [172, 156],
        [95, 185],
        [172, 245],
        [288, 189],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3.5" fill="currentColor" />
      ))}
    </svg>
  );
}
