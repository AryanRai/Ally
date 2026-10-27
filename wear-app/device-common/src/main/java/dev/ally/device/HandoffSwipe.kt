package dev.ally.device

/** A Send is authorized only by a completed upward release on the same displayed destination. */
internal class HandoffSwipe {
    private var chat:String?=null
    private var downX=0f;private var downY=0f
    private var valid=false
    fun begin(chatId:String?,x:Float,y:Float,enabled:Boolean){chat=chatId;downX=x;downY=y;valid=enabled&&!chatId.isNullOrBlank()&&x.isFinite()&&y.isFinite()}
    fun progress(x:Float,y:Float,distance:Float):Float {
        if(!valid||!x.isFinite()||!y.isFinite()||!distance.isFinite()||distance<=0f){valid=false;return 0f}
        val up=downY-y
        // Natural thumbs travel diagonally. Reject a sideways gesture, not
        // small horizontal drift during an otherwise deliberate upward pull.
        if(kotlin.math.abs(x-downX)>maxOf(distance,up.coerceAtLeast(0f)*.85f)){valid=false;return 0f}
        return ((downY-y)/distance).coerceIn(0f,1f)
    }
    fun release(chatId:String?,x:Float,y:Float,distance:Float):Boolean {val send=chatId==chat&&progress(x,y,distance)>=1f;cancel();return send}
    fun cancel(){valid=false;chat=null}
}
