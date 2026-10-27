/** Self-contained teaching cards. Controls stay local to the existing Study sandbox. */
export function studyDiagramContent(args: { html?: unknown; preset?: unknown }): string {
  if (args.preset !== undefined) {
    if (args.html !== undefined) throw Error('Choose a preset or custom html, not both.');
    if (args.preset !== 'waves' && args.preset !== 'fourier') throw Error('Choose waves or fourier.');
    return waveDiagram(args.preset);
  }
  if (typeof args.html !== 'string' || !args.html.trim()) throw Error('Supply html or a waves/fourier preset.');
  return args.html;
}

export function waveDiagram(mode: 'waves' | 'fourier'): string {
  const fourier = mode === 'fourier';
  return `<meta charset="utf-8"><style>
body{font-family:system-ui;background:#111b20;color:#eef6f5;padding:16px}
h2{font-size:18px;margin:0 0 4px}p{color:#b8c9cd;line-height:1.5;margin:6px 0 12px}
.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
label{display:grid;gap:5px}input{width:100%;accent-color:#8fe0be}output{font-variant-numeric:tabular-nums;color:#8fe0be}
button,select{background:#23363c;color:#eef6f5;border:1px solid #51676c;border-radius:8px;padding:7px}button{margin-top:12px}
svg{display:block;width:100%;height:auto;margin:12px 0;background:#15252b;border-radius:10px}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px}.formula{font-family:monospace;overflow-wrap:anywhere}
</style>
<h2>${fourier ? 'Build a wave from harmonics' : 'Explore a sine wave'}</h2>
<p>${fourier ? 'Add sine harmonics to approximate a square or sawtooth wave. The overshoot near a jump is the Gibbs effect.' : 'Move a slider: the wave and its equation update immediately. Phase moves the wave without changing its frequency.'}</p>
<div class="controls">
<label>Amplitude <output id="aValue"></output><input id="amplitude" aria-label="Amplitude" type="range" min="0" max="2" step="0.05" value="1"></label>
<label>Frequency (cycles per time unit) <output id="fValue"></output><input id="frequency" aria-label="Frequency" type="range" min="0.5" max="4" step="0.1" value="1"></label>
<label>Phase (degrees) <output id="pValue"></output><input id="phase" aria-label="Phase in degrees" type="range" min="-180" max="180" step="5" value="0"></label>
${fourier ? '<label>Number of terms <output id="nValue"></output><input id="terms" aria-label="Number of Fourier terms" type="range" min="1" max="12" step="1" value="3"></label><label>Target shape<select id="shape" aria-label="Target shape"><option value="square">Square</option><option value="sawtooth">Sawtooth</option></select></label>' : ''}
</div>
<svg id="plot" viewBox="0 0 640 290" role="img" aria-labelledby="plotTitle plotDescription">
<title id="plotTitle">${fourier ? 'Fourier approximation' : 'Sine wave'}</title><desc id="plotDescription"></desc>
<g stroke="#344a51" stroke-width="1"><path d="M40 36H620 M40 90H620 M40 144H620 M40 198H620 M40 252H620 M40 36V252 M185 36V252 M330 36V252 M475 36V252 M620 36V252"/></g>
<g fill="#b8c9cd" font-size="11"><text x="8" y="40">+2.5</text><text x="22" y="148">0</text><text x="8" y="256">−2.5</text><text x="40" y="272">0</text><text x="610" y="272">2</text><text x="245" y="286">Time (arbitrary units)</text></g>
<path id="target" fill="none" stroke="#f5ca82" stroke-width="1.5" stroke-dasharray="5 5"/>
<g id="harmonics" fill="none" stroke="#b9cfda" stroke-opacity="0.3" stroke-width="1"/>
<path id="wave" fill="none" stroke="#8fe0be" stroke-width="2.5"/>
</svg>
<div class="legend"><span style="color:#8fe0be">● ${fourier ? 'Sum' : 'Signal'}</span>${fourier ? '<span style="color:#f5ca82">┄ Target</span><span>Faint curves: individual harmonics</span>' : ''}</div>
<p class="formula" id="formula" aria-live="polite"></p><button id="reset" type="button">Reset controls</button>
<script>
(()=>{
const fourier=${fourier};
const byId=id=>document.getElementById(id);
const amplitude=byId('amplitude'),frequency=byId('frequency'),phase=byId('phase'),terms=byId('terms'),shape=byId('shape');
const tau=2*Math.PI, samples=480;
function draw(){
 const a=Number(amplitude.value),f=Number(frequency.value),p=Number(phase.value),n=terms?Number(terms.value):1;
 const square=!shape||shape.value==='square';
 byId('aValue').textContent=a.toFixed(2);byId('fValue').textContent=f.toFixed(1);byId('pValue').textContent=p+'°';if(terms)byId('nValue').textContent=n;
 const theta=t=>tau*f*t+p*Math.PI/180;
 const harmonic=(i,t)=>{const k=square?2*i+1:i+1;return a*(square?4:2)/Math.PI*(square?1:Math.pow(-1,k+1))*Math.sin(k*theta(t))/k;};
 const signal=t=>{if(!fourier)return a*Math.sin(theta(t));let sum=0;for(let i=0;i<n;i++)sum+=harmonic(i,t);return sum;};
 const path=fn=>{let d='';for(let i=0;i<=samples;i++){const t=2*i/samples;d+=(i?'L':'M')+(40+580*i/samples).toFixed(2)+','+(144-43.2*fn(t)).toFixed(2);}return d;};
 byId('wave').setAttribute('d',path(signal));
 if(fourier){
  byId('target').setAttribute('d',path(t=>{const q=theta(t);return square?a*(Math.sin(q)>=0?1:-1):a*2/Math.PI*Math.atan2(Math.sin(q),Math.cos(q));}));
  const group=byId('harmonics');group.replaceChildren();for(let i=0;i<n;i++){const curve=document.createElementNS('http://www.w3.org/2000/svg','path');curve.setAttribute('d',path(t=>harmonic(i,t)));group.append(curve);}
 }
 const equation=fourier?(square?'Σ over k = 1, 3, …, '+(2*n-1)+': (4A/πk) sin(kθ)':'Σ over k = 1 … '+n+': (2A/πk)(−1)^(k+1) sin(kθ)'):'y = A sin(θ)';
 byId('formula').textContent=equation+'; θ = 2πft + φ; A = '+a.toFixed(2)+', f = '+f.toFixed(1)+', φ = '+p+'°.';
 byId('plotDescription').textContent=byId('formula').textContent;
}
document.querySelectorAll('input,select').forEach(control=>control.addEventListener('input',draw));
byId('reset').addEventListener('click',()=>{amplitude.value='1';frequency.value='1';phase.value='0';if(terms)terms.value='3';if(shape)shape.value='square';draw();});
draw();
})();
</script>`;
}
