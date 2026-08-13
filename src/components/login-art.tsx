"use client";

/**
 * Abstract artwork for the sign-in screen.
 *
 * Concentric rings with a few arcs turning slowly at different rates, over a
 * soft field of light. Geometry rather than illustration: there is no object
 * to recognise, so nothing to get wrong, and the result reads closer to a
 * precision instrument than to decoration.
 *
 * Drawn as inline SVG rather than shipped as an image: it scales to any screen
 * without a second request, inherits the theme's colours through CSS variables
 * so it works in light and dark, and animates with CSS alone — no JavaScript
 * runs, so it costs nothing on the critical path to signing in.
 *
 * Layout note. `preserveAspectRatio="slice"` crops this viewBox hard to the
 * panel — on a wide screen only roughly y=155..745 of the 900 ever shows, and
 * the caption block sits over the lower left of that. The composition is
 * centred high and to the right for exactly that reason; positions here were
 * checked against rendered boxes, not against these coordinates.
 *
 * Everything respects `prefers-reduced-motion`: the rings simply stop. Motion
 * on a login screen is decoration, and decoration should never be the reason
 * someone feels unwell.
 */
export function LoginArt() {
  return (
    <div aria-hidden className="login-art absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        viewBox="0 0 600 900"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        fill="none"
      >
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--color-velvet)" stopOpacity="0.16" />
            <stop offset="60%" stopColor="var(--color-velvet)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--color-velvet)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="316" cy="404" r="330" fill="url(#glow)" className="art-glow" />

        {/* The whole composition shares one centre. Rotation goes on the inner
            groups, never on this one: a CSS transform in a keyframe REPLACES
            the SVG `transform` attribute rather than composing with it, so
            animating this element would wipe the translate and stack every
            ring at the top-left corner. The children's local origin is this
            centre, which is why `transform-origin: 0 0` is correct for them. */}
        <g transform="translate(316 404)">
          {/* Still rings, establishing the structure. */}
          <g className="rings" stroke="var(--color-velvet)" fill="none">
            <circle r="118" strokeWidth="1" opacity="0.16" />
            <circle r="172" strokeWidth="1" opacity="0.12" />
            <circle r="238" strokeWidth="1" opacity="0.09" />
            <circle r="300" strokeWidth="1" opacity="0.06" />
          </g>

          {/* Turning arcs. `pathLength="1"` normalises each circle's length so
              one dash pattern means the same fraction of the circumference at
              every radius — without it the dash array would have to be
              recomputed per radius and the arcs would drift out of proportion. */}
          <g stroke="var(--color-velvet)" fill="none" strokeLinecap="round">
            <g className="arc arc-1">
              <circle r="118" pathLength="1" strokeDasharray="0.2 0.8" strokeWidth="2" opacity="0.55" />
            </g>
            <g className="arc arc-2">
              <circle r="172" pathLength="1" strokeDasharray="0.12 0.88" strokeWidth="2.5" opacity="0.45" />
            </g>
            <g className="arc arc-3">
              <circle r="238" pathLength="1" strokeDasharray="0.28 0.72" strokeWidth="1.5" opacity="0.3" />
            </g>
            <g className="arc arc-4">
              <circle r="300" pathLength="1" strokeDasharray="0.08 0.92" strokeWidth="2" opacity="0.25" />
            </g>
          </g>

          {/* A dial of fine ticks on the outermost ring. */}
          <g className="ticks" stroke="var(--color-velvet)" strokeWidth="1.5" opacity="0.18">
            <Ticks count={60} radius={300} length={9} />
          </g>

          {/* Two small marks riding the rings, the only things that read as
              moving rather than turning. */}
          <g className="orbit orbit-1">
            <circle cx="0" cy="-172" r="3.5" fill="var(--color-velvet)" opacity="0.7" />
          </g>
          <g className="orbit orbit-2">
            <circle cx="0" cy="-118" r="2.5" fill="var(--color-velvet)" opacity="0.5" />
          </g>
        </g>

        {/* Slow drift, well outside the reading path. */}
        <g fill="var(--color-velvet)">
          <circle className="mote mote-1" cx="120" cy="300" r="2.2" opacity="0.22" />
          <circle className="mote mote-2" cx="540" cy="250" r="1.7" opacity="0.2" />
          <circle className="mote mote-3" cx="480" cy="640" r="2" opacity="0.16" />
        </g>
      </svg>
    </div>
  );
}

/** Evenly spaced radial ticks, drawn inward from `radius`. */
function Ticks({ count, radius, length }: { count: number; radius: number; length: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const a = (i / count) * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return (
          <line
            key={i}
            x1={cos * radius}
            y1={sin * radius}
            x2={cos * (radius - length)}
            y2={sin * (radius - length)}
          />
        );
      })}
    </>
  );
}
