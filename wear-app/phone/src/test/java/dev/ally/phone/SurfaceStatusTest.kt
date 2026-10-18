package dev.ally.phone

import dev.ally.device.SurfaceSnapshot
import dev.ally.device.SurfaceActions
import org.junit.Assert.*
import org.junit.Test

class SurfaceStatusTest {
    private val raw="""{"chats":[{"id":"device-chat","provider":"codex","status":"running","title":"Ally"}]}"""
    @Test fun cacheNeverTurnsAnOldSnapshotIntoLiveStatus() {
        assertFalse(SurfaceSnapshot.parse(raw,10000,false,11000).state.stale)
        assertTrue(SurfaceSnapshot.parse(raw,10000,false,140000).state.stale)
        assertTrue(SurfaceSnapshot.parse(raw,10000,true,11000).state.stale)
    }
    @Test fun emptyOrCorruptCacheGivesAnHonestInitialState() {
        assertFalse(SurfaceSnapshot.parse(null,0,false).state.checked)
        assertEquals("Tap refresh to check",SurfaceSnapshot.parse("broken",0,false).checkedLabel())
        assertNull(SurfaceSnapshot.parse(null,0,false).lead)
    }
    @Test fun launcherAcceptsExactChatIdsAndRejectsPathsAndInjectedQueries() {
        assertTrue(SurfaceActions.validChat("codex:original-session")); assertTrue(SurfaceActions.validChat("device-chat"))
        assertFalse(SurfaceActions.validChat("../other")); assertFalse(SurfaceActions.validChat("chat?send=1")); assertFalse(SurfaceActions.validChat(""))
    }
}
