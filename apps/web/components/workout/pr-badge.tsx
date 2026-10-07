/**
 * The personal-record mark on a logged set: a small brushed-gold plate with
 * "PR" stamped into it. Pure CSS so it stays crisp at any size and needs no
 * image asset.
 */
export function PrBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Personal record"
      title="Personal record"
      className={`pointer-events-none inline-flex select-none items-center justify-center rounded-[3px] px-[3px] font-sans text-[9px] font-extrabold leading-[13px] tracking-wider ${className}`}
      style={{
        // Fine brushed grain over a metallic gold sweep.
        backgroundImage: [
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, rgba(0,0,0,0.06) 1px 2px)",
          "linear-gradient(160deg, #fff3b0 0%, #f2c94c 28%, #c8961e 55%, #f5d76e 78%, #a8761a 100%)",
        ].join(","),
        // Bevelled edge: a lit top rim, a shaded bottom rim and a dark outline.
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(100,64,0,0.45), 0 0 0 0.5px rgba(90,60,0,0.7), 0 1px 1.5px rgba(0,0,0,0.35)",
        // Engraved: dark lettering with a highlight under it and a shadow above.
        color: "#6b4a06",
        textShadow: "0 1px 0 rgba(255,246,200,0.8), 0 -0.5px 0 rgba(60,36,0,0.6)",
      }}
    >
      PR
    </span>
  );
}
