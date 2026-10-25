const capability = location.hash.slice(1);
const el = id => document.getElementById(id);
const format = value => new Intl.NumberFormat().format(value);
function row(parent, label, value) {
  const line=document.createElement('div');line.className='row';
  const name=document.createElement('span'),number=document.createElement('strong');
  name.textContent=label;number.textContent=value;line.append(name,number);parent.append(line);
}
function recorded(provider, data) {
  const host=el(`${provider}-recorded`);host.replaceChildren();
  if(!data) {row(host,'Recorded in Ally','Unavailable');return;}
  row(host,'Runs with reported usage',format(data.runs));
  row(host,'Reported input tokens',data.inputTokens==null?'Unavailable':format(data.inputTokens));
  row(host,'Reported output tokens',data.outputTokens==null?'Unavailable':format(data.outputTokens));
  if(data.cachedTokens!=null)row(host,'Cached input tokens (included)',format(data.cachedTokens));
  if(data.costUsd!=null)row(host,'Reported cost (USD)',new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:4}).format(data.costUsd));
}
async function refresh() {
  const button=el('refresh');button.disabled=true;
  el('status').textContent='Loading usage…';
  try {
    if(!capability)throw Error('Open Settings from Ally to reconnect.');
    const response=await fetch('/notch-api/v1/usage',{headers:{Authorization:`Bearer ${capability}`},signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw Error('Usage is unavailable. Check that Ally desktop is running, then refresh.');
    const data=await response.json();const host=el('codex-limits');host.replaceChildren();
    if(!data.codex.windows.length) {
      const p=document.createElement('p');p.className='empty';p.textContent='Account allowance isn’t available through this connection.';host.append(p);
    }
    for(const limit of data.codex.windows) {
      const group=document.createElement('div');group.className='limit';
      const duration=limit.durationMins==null?limit.window:limit.durationMins>=1440?`${format(limit.durationMins/1440)} day`:limit.durationMins>=60?`${format(limit.durationMins/60)} hour`:`${format(limit.durationMins)} minute`;
      row(group,`${limit.name} · ${duration}`,`${format(limit.usedPercent)}% used`);
      const bar=document.createElement('progress');bar.max=100;bar.value=limit.usedPercent;bar.setAttribute('aria-label',`${limit.name} ${duration} allowance used`);group.append(bar);
      if(limit.resetsAt) {const p=document.createElement('p');p.className='muted';p.textContent=`Resets ${new Date(limit.resetsAt).toLocaleString()}`;group.append(p);}
      host.append(group);
    }
    if(data.codex.lifetimeTokens!=null)row(host,'Account lifetime tokens',format(data.codex.lifetimeTokens));
    recorded('codex',data.recorded?.codex);recorded('claude',data.recorded?.claude);
    el('since').textContent=data.recorded?`Ally recording started ${new Date(data.recorded.since).toLocaleString()}.`:'Recorded Ally usage is unavailable.';
    el('status').textContent=`Checked ${new Date(data.codex.checkedAt).toLocaleTimeString()} · account data refreshes at most every 30 seconds`;
  } catch(error) {el('status').textContent=error.name==='TimeoutError'?'Usage request timed out. Refresh to retry.':error.message;}
  finally {button.disabled=false;}
}
el('refresh').addEventListener('click',refresh);
void refresh();
