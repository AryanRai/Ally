import type { TutorMark } from '../../electron/visualTutor/types';

export const colors = { mint: '#70f0c0', blue: '#83b8ff', amber: '#ffd378', pink: '#ff9bc8', white: '#ffffff' };

/** No generated HTML, JS, external resources or arbitrary SVG paths are evaluated. */
export default function Marks({ marks, width, height, prefix = 'tutor' }: { marks: TutorMark[]; width: number; height: number; prefix?: string }) {
  const p = (point: { x: number; y: number }) => ({ x: point.x * width / 1000, y: point.y * height / 1000 });
  return <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" aria-label="Visual explanation" className="tutor-marks">
    <defs>{Object.entries(colors).map(([name, color]) => <marker key={name} id={`${prefix}-${name}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L9 5 L1 9" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></marker>)}</defs>
    {marks.map(mark => {
      const first = p(mark.points[0]);
      const last = p(mark.points[1] ?? mark.points[0]);
      const color = colors[mark.color];
      const x = Math.min(first.x, last.x), y = Math.min(first.y, last.y), w = Math.abs(first.x - last.x), h = Math.abs(first.y - last.y);
      let shape;
      switch (mark.kind) {
        case 'arrow': case 'line': shape = <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} markerEnd={mark.kind === 'arrow' ? `url(#${prefix}-${mark.color})` : undefined} />; break;
        case 'rect': shape = <rect x={x} y={y} width={w} height={h} rx="8" fill={`${color}14`} />; break;
        case 'ellipse': shape = <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={`${color}14`} />; break;
        case 'polyline': shape = <polyline points={mark.points.map(point => { const at = p(point); return `${at.x},${at.y}`; }).join(' ')} />; break;
        case 'text': shape = null; break;
      }
      return <g key={mark.id} stroke={color} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="tutor-mark">
        {shape}
        {mark.text && <text x={Math.min(width - 12, Math.max(12, first.x))} y={Math.min(height - 12, Math.max(28, first.y - (mark.kind === 'text' ? 0 : 12)))} fill={color} stroke="#121720" strokeWidth="5" paintOrder="stroke" fontSize="22" fontFamily="'Geist Variable', system-ui, sans-serif" fontWeight="550">{mark.text.split('\n').map((line, index) => <tspan key={index} x={Math.min(width - 12, Math.max(12, first.x))} dy={index ? '1.3em' : 0}>{line}</tspan>)}</text>}
      </g>;
    })}
  </svg>;
}
