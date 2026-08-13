"use client";

/**
 * Animated salon-tool artwork for the sign-in screen.
 *
 * The counter is the first thing a salon sees each morning, and a bare form on
 * a flat background reads as "internal tool". This is the one screen where a
 * little craft changes how the whole product is perceived, so it earns the
 * bytes.
 *
 * The subject is the trade itself — shears, a water sprayer, a cutting comb —
 * rather than generic decoration, so the screen says what the software is for
 * before a word is read.
 *
 * Drawn as inline SVG rather than shipped as an image: it scales to any screen
 * without a second request, inherits the theme's colours through CSS variables
 * so it works in light and dark, and animates with CSS alone — no JavaScript
 * runs, so it costs nothing on the critical path to signing in.
 *
 * Everything here respects `prefers-reduced-motion`: the artwork settles into
 * its composed, open state rather than looping. Motion on a login screen is
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
          <linearGradient id="steelGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-velvet)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-velvet)" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="toolGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-velvet)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-velvet)" stopOpacity="0.18" />
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--color-velvet)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-velvet)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft light behind the composition, so the tools sit in something
            rather than floating on a flat field. */}
        <circle cx="300" cy="390" r="300" fill="url(#glow)" className="art-glow" />

        {/* Layout note. `slice` crops this viewBox to the panel, and the panel
            is much wider than it is tall, so only roughly y=155..745 of the 900
            ever shows — and the caption block sits over the lower LEFT of that.
            Everything below is placed to clear both: nothing may reach past
            y≈680 on the left-hand side, or it lands on the wording. */}

        {/* ── Shears ──
            Positioning sits on the OUTER group and the animation on the inner
            one, deliberately. A CSS `transform` in a keyframe REPLACES the SVG
            `transform` attribute rather than composing with it, so putting both
            on one element would wipe `translate(...)` to the identity matrix
            and stack everything at the top-left corner. The inner group's local
            origin is the pivot, so `transform-origin: 0 0` rotates each arm
            about the rivet exactly as real shears do. */}
        <g transform="translate(300 400)">
          <g className="shear shear-a">
            <ShearArm />
          </g>
          <g className="shear shear-b">
            <g transform="scale(-1 1)">
              <ShearArm />
            </g>
          </g>
          {/* The rivet, drawn last so it sits over both arms. */}
          <circle r="8" fill="var(--color-velvet)" opacity="0.55" className="rivet" />
          <circle r="3" fill="var(--color-bg)" opacity="0.9" className="rivet" />
        </g>

        {/* ── Water sprayer ── */}
        <g transform="translate(470 578)">
          <g className="tool tool-sprayer">
            <Sprayer />
          </g>
        </g>

        {/* ── Cutting comb ── */}
        <g transform="translate(205 578) rotate(-12)">
          <g className="tool tool-comb">
            <Comb />
          </g>
        </g>

        {/* Mist from the sprayer nozzle, drifting up and away. Positioned at
            the nozzle mouth in the sprayer's own coordinates. */}
        <g transform="translate(470 578)" fill="var(--color-velvet)">
          <circle className="mist mist-1" cx="-34" cy="-38" r="2.6" />
          <circle className="mist mist-2" cx="-48" cy="-44" r="1.9" />
          <circle className="mist mist-3" cx="-40" cy="-52" r="2.2" />
          <circle className="mist mist-4" cx="-56" cy="-34" r="1.6" />
        </g>

        {/* Slow drifting motes — the visual equivalent of dust in a sunbeam. */}
        <g fill="var(--color-velvet)">
          <circle className="mote mote-1" cx="250" cy="620" r="2.4" opacity="0.3" />
          <circle className="mote mote-2" cx="520" cy="300" r="1.8" opacity="0.26" />
          <circle className="mote mote-3" cx="360" cy="800" r="2.0" opacity="0.2" />
          <circle className="mote mote-4" cx="140" cy="330" r="1.6" opacity="0.28" />
        </g>
      </svg>
    </div>
  );
}

/**
 * One half of a pair of shears, drawn from the rivet outwards: blade up,
 * shank and finger ring down. The local origin is the rivet, which is what
 * lets both arms share a rotation origin.
 */
function ShearArm() {
  return (
    <g
      stroke="url(#steelGrad)"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {/* Blade, tapering to a point. */}
      <path d="M4 -6 L24 -212" strokeWidth="10" />
      {/* Cutting edge, a shade brighter so the blade reads as having two faces. */}
      <path
        d="M8 -14 L25 -204"
        strokeWidth="2"
        stroke="var(--color-velvet)"
        opacity="0.5"
      />
      {/* Shank sweeping down to the ring. */}
      <path d="M-3 6 C -9 30, -17 46, -23 58" strokeWidth="8" />
      {/* Finger ring. */}
      <ellipse cx="-34" cy="84" rx="27" ry="31" strokeWidth="8" />
    </g>
  );
}

/** A trigger water sprayer, the other thing always within reach of a chair. */
function Sprayer() {
  return (
    <g stroke="url(#toolGrad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Bottle. */}
      <path d="M-28 -4 h56 a10 10 0 0 1 10 10 v72 a12 12 0 0 1 -12 12 h-52 a12 12 0 0 1 -12 -12 v-72 a10 10 0 0 1 10 -10 z" />
      {/* Water line, so it reads as full rather than as an empty box. */}
      <path d="M-30 44 h60" strokeWidth="4" opacity="0.55" />
      {/* Neck and collar. */}
      <path d="M-11 -4 v-22 h22 v22" />
      {/* Head and nozzle, angled up-left where the mist goes. */}
      <path d="M-11 -26 h26 a8 8 0 0 0 0 -16 h-30 l-16 -10" />
      {/* Trigger. */}
      <path d="M-14 -18 l-14 8 v10" strokeWidth="5" />
    </g>
  );
}

/** A cutting comb — wide teeth one end, fine the other, as a real one is. */
function Comb() {
  const teeth = Array.from({ length: 17 }).map((_, i) => {
    // Fine teeth crowd the right-hand half, exactly as on a real cutting comb.
    // The offset for the fine half counts from i-8, not i-9: at i-9 the first
    // fine tooth lands exactly on the last wide one and the two overlap.
    const x = -92 + (i < 9 ? i * 13 : 104 + (i - 8) * 8.5);
    return <path key={i} d={`M${x} 8 v${i < 9 ? 40 : 30}`} strokeWidth={i < 9 ? 5 : 3.5} />;
  });
  return (
    <g stroke="url(#toolGrad)" strokeLinecap="round" fill="none">
      {/* Spine. */}
      <path d="M-98 -2 h196" strokeWidth="12" />
      {teeth}
    </g>
  );
}
