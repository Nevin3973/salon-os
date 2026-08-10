"use client";

/**
 * Animated botanical artwork for the sign-in screen.
 *
 * The counter is the first thing a salon sees each morning, and a bare form on
 * a flat background reads as "internal tool". This is the one screen where a
 * little craft changes how the whole product is perceived, so it earns the
 * bytes.
 *
 * Drawn as inline SVG rather than shipped as an image: it scales to any screen
 * without a second request, inherits the theme's colours through CSS variables
 * so it works in light and dark, and animates with CSS alone — no JavaScript
 * runs, so it costs nothing on the critical path to signing in.
 *
 * Everything here respects `prefers-reduced-motion`: the artwork settles into
 * its final composed state rather than looping. Motion on a login screen is
 * decoration, and decoration should never be the reason someone feels unwell.
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
          <linearGradient id="petalGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-velvet)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-velvet)" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="stemGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-velvet)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--color-velvet)" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--color-velvet)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-velvet)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft light behind the composition, so the petals sit in something
            rather than floating on a flat field. */}
        <circle cx="430" cy="300" r="280" fill="url(#glow)" className="art-glow" />

        {/* Stems, drawn on with a dash offset so they appear to grow. */}
        <g stroke="url(#stemGrad)" strokeWidth="1.5" strokeLinecap="round">
          <path className="stem stem-1" pathLength="1" d="M470 900 C 470 700, 430 560, 430 400" />
          <path className="stem stem-2" pathLength="1" d="M540 900 C 540 720, 505 600, 512 470" />
          <path className="stem stem-3" pathLength="1" d="M395 900 C 395 760, 360 660, 352 545" />
        </g>

        {/* Three blooms at different scales, each opening in turn.

            Positioning sits on the OUTER group and the animation on the inner
            one, deliberately. A CSS `transform` in a keyframe replaces the SVG
            `transform` attribute rather than composing with it — putting both
            on one element wiped `translate(...)` to the identity matrix and
            stacked all three flowers off-screen at the top-left corner. The
            inner group's local origin is the flower's centre, so scale and
            rotate pivot correctly about it. */}
        <g transform="translate(430 400)">
          <g className="bloom bloom-1">
            <Petals />
          </g>
        </g>
        <g transform="translate(512 470) scale(0.62)">
          <g className="bloom bloom-2">
            <Petals />
          </g>
        </g>
        <g transform="translate(352 545) scale(0.45)">
          <g className="bloom bloom-3">
            <Petals />
          </g>
        </g>

        {/* Drifting motes, the visual equivalent of dust in a sunbeam. */}
        <g fill="var(--color-velvet)">
          <circle className="mote mote-1" cx="300" cy="640" r="2.5" opacity="0.35" />
          <circle className="mote mote-2" cx="520" cy="700" r="1.8" opacity="0.28" />
          <circle className="mote mote-3" cx="380" cy="760" r="2.1" opacity="0.22" />
          <circle className="mote mote-4" cx="470" cy="250" r="1.6" opacity="0.3" />
        </g>
      </svg>
    </div>
  );
}

/** One flower: eight petals around a centre, rotated into a ring. */
function Petals() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <ellipse
          key={i}
          rx="26"
          ry="72"
          cx="0"
          cy="-52"
          fill="url(#petalGrad)"
          transform={`rotate(${i * 45})`}
          style={{ transformOrigin: "0 0" }}
        />
      ))}
      <circle r="15" fill="var(--color-velvet)" opacity="0.5" />
    </>
  );
}
