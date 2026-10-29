import {randomUUID} from 'node:crypto';
/** Private, bounded audio storage. Loading audio cannot start synthesis or read files. */
export class StudyNarration {
  private rows=new Map<string,{board:string;text:string;bytes:Uint8Array}>();
  private pending=new Map<string,Promise<string>>();
  private generation=0;
  constructor(private synthesize:(text:string)=>Promise<string>){}
  async prepare(board:string,text:string):Promise<string>{
    if(!text.trim()||text.length>1000)throw Error('Use 1–1000 narration characters');
    for(const [key,row]of this.rows)if(row.board===board&&row.text===text)return key;
    const signature=JSON.stringify([board,text]),prior=this.pending.get(signature);if(prior)return prior;
    if(this.rows.size+this.pending.size>=16)throw Error('Lesson narration limit reached');
    const generation=this.generation;
    const work=(async()=>{const bytes=Buffer.from(await this.synthesize(text),'base64');
      if(generation!==this.generation)throw Error('Narration board was closed');
      if(bytes.length<44||bytes.length>6*1024*1024)throw Error('Narration audio is empty or exceeds 6MB');
      const key=randomUUID();this.rows.set(key,{board,text,bytes});return key;
    })().finally(()=>{if(this.pending.get(signature)===work)this.pending.delete(signature);});this.pending.set(signature,work);return work;
  }
  read(board:string,key:string){const row=this.rows.get(key);if(!row||row.board!==board)throw Error('Unknown narration on this board');return new Uint8Array(row.bytes);}
  reset(){this.generation++;this.rows.clear();this.pending.clear();}
}
