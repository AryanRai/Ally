package dev.ally.phone
import dev.ally.device.HandoffSwipe
import org.junit.Assert.*
import org.junit.Test
class HandoffSwipeTest{
 @Test fun naturalDiagonalPullCommitsOnceAtTheShorterThreshold(){val s=HandoffSwipe();s.begin("a",100f,200f,true);assertEquals(.5f,s.progress(118f,176f,48f),.001f);assertTrue(s.release("a",135f,148f,48f));assertFalse(s.release("a",135f,148f,48f))}
 @Test fun crossedThresholdThenWithdrawnNeverSends(){val s=HandoffSwipe();s.begin("a",100f,200f,true);assertEquals(1f,s.progress(110f,140f,48f),.001f);assertFalse(s.release("a",110f,180f,48f))}
 @Test fun invalidCoordinatesAndThresholdNeverSend(){val s=HandoffSwipe();for(distance in listOf(0f,-1f,Float.NaN)){s.begin("a",0f,100f,true);assertFalse(s.release("a",0f,0f,distance))};s.begin("a",Float.NaN,100f,true);assertFalse(s.release("a",0f,0f,48f))}
 @Test fun onlyUpwardReleaseOnSameDestinationAuthorizesSend(){val s=HandoffSwipe();s.begin("chat-a",0f,100f,true);assertTrue(s.release("chat-a",0f,0f,72f));assertFalse(s.release("chat-a",0f,0f,72f))}
 @Test fun shortDownwardSidewaysCancelledAndChangedChatNeverSend(){val s=HandoffSwipe();for((x,y)in listOf(0f to 60f,0f to 140f,100f to 0f)){s.begin("a",0f,100f,true);assertFalse(s.release("a",x,y,72f))};s.begin("a",0f,100f,true);s.cancel();assertFalse(s.release("a",0f,0f,72f));s.begin("a",0f,100f,true);assertFalse(s.release("b",0f,0f,72f));s.begin("a",0f,100f,false);assertFalse(s.release("a",0f,0f,72f))}
}
