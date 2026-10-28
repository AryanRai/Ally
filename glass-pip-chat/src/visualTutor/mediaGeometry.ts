/** Content rectangle for object-fit:contain; excludes letterboxing. */
export function mediaContentRect(width:number,height:number,pixelWidth:number,pixelHeight:number){
 if(width<=0||height<=0||pixelWidth<=0||pixelHeight<=0)return{x:0,y:0,width:0,height:0};
 const scale=Math.min(width/pixelWidth,height/pixelHeight),w=pixelWidth*scale,h=pixelHeight*scale;
 return{x:(width-w)/2,y:(height-h)/2,width:w,height:h};
}
