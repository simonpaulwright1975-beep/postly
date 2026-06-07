/** The radiating sunburst motif from the reference rate card. Purely decorative. */
export default function Sunburst({ className = "" }: { className?: string }) {
  const rays = Array.from({ length: 12 });
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        {rays.map((_, i) => {
          const angle = (i * 360) / rays.length - 90;
          const rad = (angle * Math.PI) / 180;
          const inner = 18;
          const outer = 46;
          const x1 = 50 + inner * Math.cos(rad);
          const y1 = 50 + inner * Math.sin(rad);
          const x2 = 50 + outer * Math.cos(rad);
          const y2 = 50 + outer * Math.sin(rad);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
    </svg>
  );
}
