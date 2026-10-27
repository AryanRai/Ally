export const DISCOVERY_PROVIDERS = ['codex','claude'] as const;
type Provider = typeof DISCOVERY_PROVIDERS[number];
interface Row {id:string;provider:Provider;updatedAt:number}
export interface ProviderPage<T> {chats:T[];nextOffset:number|null}

/** A failed provider refresh is not an authoritative empty list. */
export function mergeProviderPages<T extends Row>(previous:T[],offsets:Record<Provider,number|null>,expanded:Record<Provider,boolean>,results:PromiseSettledResult<ProviderPage<T>|undefined>[],more:boolean) {
  const nextOffsets={...offsets},nextExpanded={...expanded},errors:string[]=[];
  const chats=DISCOVERY_PROVIDERS.flatMap((provider,index)=>{
    const result=results[index],old=previous.filter(row=>row.provider===provider);
    if(result?.status==='rejected') {errors.push(`${provider==='codex'?'Codex':'Claude'} chats could not refresh. Retry loading chats.`);return old;}
    if(!result || !result.value)return old;
    if(more || !expanded[provider])nextOffsets[provider]=result.value.nextOffset;
    if(more)nextExpanded[provider]=true;
    const rows=more || expanded[provider] ? [...old,...result.value.chats] : result.value.chats;
    return [...new Map(rows.map(row=>[row.id,row])).values()];
  }).sort((a,b)=>b.updatedAt-a.updatedAt);
  return {chats,offsets:nextOffsets,expanded:nextExpanded,error:errors.join(' ')};
}
