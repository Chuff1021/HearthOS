import { useId } from "react";

type Variant = "tile" | "mark";

type Props = {
  className?: string;
  size?: number;
  variant?: Variant;
};

// HearthOS brand mark — a Forge-&-Flame ember palette flame.
// "tile" renders the flame inside an ember gradient rounded square (sidebar header).
// "mark" renders the flame standalone with a gradient fill (sign-in, hero, etc).
export default function FlameLogo({ className, size = 32, variant = "tile" }: Props) {
  const gid = useId();
  const outer = `${gid}-outer`;
  const inner = `${gid}-inner`;

  const flameOuter = (
    <linearGradient id={outer} x1="50%" y1="100%" x2="50%" y2="0%">
      <stop offset="0%" stopColor="#cc6510" />
      <stop offset="55%" stopColor="#f8971f" />
      <stop offset="100%" stopColor="#eaa23f" />
    </linearGradient>
  );
  const flameInner = (
    <linearGradient id={inner} x1="50%" y1="100%" x2="50%" y2="0%">
      <stop offset="0%" stopColor="#f8971f" />
      <stop offset="55%" stopColor="#ffcd6b" />
      <stop offset="100%" stopColor="#fff5d6" />
    </linearGradient>
  );

  // Material-style "fire" silhouette + a small inner hot core that gives the
  // flame depth. Path constants kept inline so the component is one file.
  const outerD =
    "M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14.37c.38 5.6 5.11 7.32 6.81 7.54 2.43.31 5.06-.14 6.95-1.87 2.08-1.93 2.84-5.01 1.72-7.69z";
  const innerD =
    "M10.2 17.38c1.44-.35 2.18-1.39 2.38-2.31.33-1.43-.96-2.83-.09-5.09.33 1.87 3.27 3.04 3.27 5.08.08 2.53-2.66 4.7-5.56 2.32z";

  if (variant === "mark") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        aria-hidden="true"
      >
        <defs>
          {flameOuter}
          {flameInner}
        </defs>
        <path d={outerD} fill={`url(#${outer})`} />
        <path d={innerD} fill={`url(#${inner})`} />
      </svg>
    );
  }

  // tile variant — flame on an ember rounded box, mirrors the prior layout
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4.5),
        background: "linear-gradient(135deg, #f8971f 0%, #eaa23f 100%)",
        boxShadow: "0 0 16px rgba(248,151,31,0.45), inset 0 1px 0 rgba(255,243,210,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={Math.round(size * 0.625)}
        height={Math.round(size * 0.625)}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d={outerD} fill="#ffffff" />
        <path d={innerD} fill="#332e2d" opacity={0.18} />
      </svg>
    </div>
  );
}
