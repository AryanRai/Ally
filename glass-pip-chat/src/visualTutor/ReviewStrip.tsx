import type {TutorBoard} from '../../electron/visualTutor/types';
export default function ReviewStrip({board,select,control}:{board:TutorBoard;select:(id:string)=>void;control:(action:'pause'|'play'|'replay'|'rate',rate?:number)=>void}){
 const step=board.steps[board.selected],saved=step&&board.bookmarks?.[step.id];
 return <nav aria-label="Lesson review" style={{display:'flex',gap:5,alignItems:'center',padding:'6px 8px',flexWrap:'wrap',borderTop:'1px solid #ffffff18'}}>
  <div style={{display:'flex',gap:4,overflowX:'auto',maxWidth:'100%'}}>{board.steps.map((s,i)=><button key={s.id} type="button" aria-current={s.id===step?.id?'step':undefined} title={s.lesson?.cue||s.explanation||s.title} onClick={()=>select(s.id)} style={{whiteSpace:'nowrap',fontWeight:s.id===step?.id?700:400}}>{i+1}. {s.title.slice(0,34)}</button>)}</div>
  {step?.clip?.state==='ready'&&<><button type="button" aria-label="Pause lesson" onClick={()=>control('pause')}>Pause</button><button type="button" aria-label="Continue lesson" onClick={()=>control('play')}>Play</button><button type="button" aria-label="Replay section" onClick={()=>control('replay')}>Replay</button><button type="button" aria-label="Slower playback" onClick={()=>control('rate',Math.max(.5,(saved?.rate??1)-.25))}>Slower</button>{saved&&<span aria-label="Saved playback position">{saved.time.toFixed(1)}s · {saved.rate}×</span>}</>}
 </nav>;
}
