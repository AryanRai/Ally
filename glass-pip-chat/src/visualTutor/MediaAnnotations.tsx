import type {MediaAnnotation} from '../../electron/visualTutor/lesson';
const colors={ink:'#f1f4f8',grey:'#a1a8b5',orange:'#ffb454',blue:'#3380FF',green:'#75d9a3',red:'#ff7979'};
// Same 16px equilateral rounded triangle and 9%-of-side radius as native
// CursorClusterRenderer.CreateRoundedTrianglePath. The inverse scale keeps
// its silhouette circular/undistorted inside the video's normalized SVG.
const pointerPath='M-4,-2.309 L-6.753,2.459 A1.44,1.44 0 0 0 -5.506,4.619 L5.506,4.619 A1.44,1.44 0 0 0 6.753,2.459 L1.247,-7.077 A1.44,1.44 0 0 0 -1.247,-7.077 Z';
export default function MediaAnnotations({annotations,time,rect}:{annotations:MediaAnnotation[];time:number;rect:{x:number;y:number;width:number;height:number}}){
 return <svg aria-label="Animation annotations" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position:'absolute',left:rect.x,top:rect.y,width:rect.width,height:rect.height,pointerEvents:'none',overflow:'hidden'}}>
  {annotations.filter(a=>time>=a.at&&(a.until===undefined||time<=a.until)).map(a=>{
   const color=colors[a.tone],label=a.write?a.text?.slice(0,Math.floor((time-a.at)*24)+1):a.text;
   const progress=a.kind==='pointer'&&a.x2!==undefined?Math.min(1,Math.max(0,(time-a.at)/(a.travel??.6))):0;
   const x=a.x+(a.x2===undefined?0:(a.x2-a.x)*progress),y=a.y+(a.y2===undefined?0:(a.y2-a.y)*progress);
   return <g key={a.id} data-annotation-id={a.id} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    {a.kind==='highlight'&&<rect x={a.x} y={a.y} width={a.width} height={a.height} rx="8" fill={color} fillOpacity=".15"/>}
    {a.kind==='pointer'&&<g data-native-study-pointer="true" transform={`translate(${x},${y}) scale(${1000/Math.max(1,rect.width)},${1000/Math.max(1,rect.height)}) rotate(${a.x2===undefined?0:Math.atan2((a.y2!-a.y)*rect.height,(a.x2-a.x)*rect.width)*180/Math.PI+90})`}><path d={pointerPath} fill={color} stroke="none" style={{filter:`drop-shadow(0 0 4px ${color}88)`}}/></g>}
    {a.kind==='arrow'&&<><path d={`M${a.x},${a.y} L${a.x2},${a.y2}`}/><path transform={`translate(${a.x2},${a.y2}) rotate(${Math.atan2(a.y2!-a.y,a.x2!-a.x)*180/Math.PI})`} d="M-20,-12 L0,0 -20,12"/></>}
    {label&&<text x={x} y={Math.max(24,y-24)} stroke="none" fill={color} fontSize="30" fontFamily="system-ui,sans-serif" style={{paintOrder:'stroke',stroke:'#111b20',strokeWidth:4}}>{label}</text>}
   </g>;
  })}
 </svg>;
}
