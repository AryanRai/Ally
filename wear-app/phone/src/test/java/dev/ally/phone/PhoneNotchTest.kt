package dev.ally.phone

import dev.ally.phone.notch.*
import org.junit.Assert.*
import org.junit.Test

class PhoneNotchTest {
    @Test fun statusCyclingKeepsLiveSelectionAndFallsBackWhenExpired(){
        val state=NotchPolicy.project(listOf(NotchItem("a","A",expiresAt=150),NotchItem("b","B",expiresAt=300),NotchItem("a","Duplicate")),2,0,0,true,100)
        val rows=NotchPolicy.liveRows(state)
        assertEquals(2,rows.size);assertEquals("b",NotchPolicy.next(rows,"a"));assertEquals("a",NotchPolicy.next(rows,"b"))
        assertEquals("b",NotchPolicy.selected(rows,"b")?.key)
        val after=NotchPolicy.liveRows(NotchPolicy.project(state.items,1,0,0,true,200))
        assertEquals("b",NotchPolicy.selected(after,"a")?.key)
        assertNull(NotchPolicy.next(emptyList(),"a"))
        assertTrue(NotchPolicy.liveRows(NotchState(null,0,0,0,true,listOf(NotchItem("selected:x","Idle")))).isEmpty())
    }
    @Test fun oneLineStatusNeverOverlapsStatusBarEvenWhenCameraIsShorter(){
        val row=NotchGeometry.statusRow(1080,2400,3f,0,0,120,listOf(NotchCutout(500,0,580,75)),1f)
        assertTrue(row.y>=120);assertEquals(108,row.height);assertTrue(row.x>=0 && row.x+row.width<=1080)
    }

    @Test fun cameraHaloNeverAnimatesIdleOrAgainstMotionAndPowerPreferences(){
        assertTrue(NotchPolicy.haloAnimation(false,false,true,true))
        assertFalse(NotchPolicy.haloAnimation(false,false,true,false))
        assertFalse(NotchPolicy.haloAnimation(true,false,true,true))
        assertFalse(NotchPolicy.haloAnimation(false,true,true,true))
        assertFalse(NotchPolicy.haloAnimation(false,false,false,true))
    }

    @Test fun idleCameraNeverAutoExpandsAndStatusExpiresUnlessPillWasExplicitlySelected(){
        assertTrue(NotchPolicy.cameraMode(null,100,0))
        assertTrue(NotchPolicy.cameraMode("camera",100,0))
        assertFalse(NotchPolicy.cameraMode("camera",100,8100))
        assertTrue(NotchPolicy.cameraMode("camera",8100,8100))
        assertFalse(NotchPolicy.cameraMode("pill",9000,8100))
    }
    @Test fun cameraTargetStaysSmallAndStatusSitsBelowCameraAtAllSizes(){
        val cut=listOf(NotchCutout(490,0,590,100))
        val ring=NotchGeometry.camera(1080,2400,3f,100,cut)
        assertEquals(132,ring.width);assertEquals(132,ring.height)
        assertEquals(540,ring.x+ring.width/2)
        for(scale in listOf(.8f,1f,1.3f)){
            val row=NotchGeometry.status(1080,2400,3f,0,0,100,cut,scale)
            assertEquals(144,row.height);assertTrue(row.y>=100)
            assertTrue(row.width in 528..858);assertTrue(row.x>=0 && row.x+row.width<=1080)
        }
        val shifted=NotchGeometry.camera(1080,2400,3f,100,cut,10f,12f)
        assertEquals(ring.x+30,shifted.x);assertTrue(shifted.y>ring.y)
        for((w,h) in listOf(2400 to 1080,30 to 40)){
            val b=NotchGeometry.camera(w,h,3f,70,emptyList(),32f,-32f)
            assertTrue(b.x>=0 && b.y>=0 && b.x+b.width<=w && b.y+b.height<=h)
            val status=NotchGeometry.status(w,h,3f,75,0,70,emptyList(),1.3f)
            assertTrue(status.x>=0 && status.y>=0 && status.x+status.width<=w && status.y+status.height<=h)
        }
    }

    @Test fun realDecisionsOutrankControlAndEventsExpireWithoutInventingAnAnswer(){
        val items=listOf(NotchItem("request","Approval","","request",200,100),NotchItem("control","Acting","","control",300,95),NotchItem("song","Song","","media",400,20),NotchItem("request","Duplicate","","request",200,100))
        assertEquals("request",NotchPolicy.project(items,2,1,1,true,100).lead?.key)
        assertEquals("control",NotchPolicy.project(items,2,1,0,true,200).lead?.key)
        assertNull(NotchPolicy.project(items,0,0,0,false,400).lead)
    }
    @Test fun disableLockScreenAndExpandedAlwaysHideAndSnoozeDoesNotLoseDecisions(){
        val state=NotchState(NotchItem("q","Question"),1,2,1,true)
        fun show(enabled:Boolean=true,ready:Boolean=true,locked:Boolean=false,on:Boolean=true,expanded:Boolean=false,attention:Int=1)=NotchPolicy.show(enabled,ready,locked,on,expanded,100,200,state.copy(attention=attention))
        assertTrue(show());assertFalse(show(enabled=false));assertFalse(show(ready=false));assertFalse(show(locked=true));assertFalse(show(on=false));assertFalse(show(expanded=true));assertFalse(show(attention=0))
        assertTrue(NotchPolicy.show(true,true,false,true,false,200,200,state.copy(attention=0)))
    }
    @Test fun geometryFitsPortraitLeftCameraLandscapeAndTinyWindows(){
        for((w,h) in listOf(1080 to 2400,2400 to 1080,120 to 180)){
            val cut=if(w<h)listOf(NotchCutout(w/2-30,0,w/2+30,75))else listOf(NotchCutout(0,400,75,500))
            val b=NotchGeometry.place(w,h,2.75f,if(w>h)75 else 0,0,70,cut)
            assertTrue(b.x>=0);assertTrue(b.y>=0);assertTrue(b.width>0);assertTrue(b.height>0);assertTrue(b.x+b.width<=w);assertTrue(b.y+b.height<=h)
        }
        val left=NotchGeometry.place(1080,2400,3f,0,0,60,listOf(NotchCutout(30,0,100,90)))
        assertEquals(0,left.x);assertEquals(0,left.y);assertTrue(left.height>=90+90)
    }
    @Test fun invalidDensityIsRejected(){
        for(d in listOf(Float.NaN,Float.POSITIVE_INFINITY,0f,-1f))assertThrows(IllegalArgumentException::class.java){NotchGeometry.place(1080,2400,d,0,0,0,emptyList())}
    }
    @Test fun privacyAndAppOptInAreRequiredForEveryNotification(){
        assertTrue(NotchPolicy.notificationAllowed(false,true,false,"msg","New message"))
        assertFalse(NotchPolicy.notificationAllowed(true,true,false,"msg","New message"))
        assertFalse(NotchPolicy.notificationAllowed(false,false,false,"msg","New message"))
        assertFalse(NotchPolicy.notificationAllowed(false,true,true,"msg","New message"))
        for(t in listOf("Your verification code","Password reset","One-time code","Sign-in request"))assertFalse(NotchPolicy.notificationAllowed(false,true,false,"msg",t))
        assertFalse(NotchPolicy.notificationAllowed(false,true,false,"call","Incoming call"))
    }
    @Test fun timersRequireExplicitChronometerDeadlineNoGuessingFromAlarmText(){
        assertEquals(200L,NotchPolicy.countdown(true,true,200,100))
        assertNull(NotchPolicy.countdown(false,true,200,100));assertNull(NotchPolicy.countdown(true,false,200,100));assertNull(NotchPolicy.countdown(true,true,100,100));assertNull(NotchPolicy.countdown(true,true,Long.MAX_VALUE,100))
    }
    @Test fun requestAloneNeverLightsControlAndExpiredDisconnectedLockedSessionsDisappear(){
        assertFalse(ControlVisualState().visible(0,true,false,true))
        val g=ControlVisualState("validated-grant","codex:chat","Current chat",200)
        assertTrue(g.visible(100,true,false,true));assertFalse(g.visible(200,true,false,true));assertFalse(g.visible(100,false,false,true));assertFalse(g.visible(100,true,true,true));assertFalse(g.visible(100,true,false,false))
        assertEquals(2,g.performing().performing().operations);assertEquals(0,g.performing().settled().settled().operations)
        assertTrue(g.performing(100).settled().activityPulse(200));assertFalse(g.performing(100).settled().activityPulse(750))
        assertFalse(ControlVisualState().visible(100,true,false,true))
    }
}
