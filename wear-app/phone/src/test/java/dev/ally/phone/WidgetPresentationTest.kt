package dev.ally.phone
import dev.ally.device.AssistantActivityState
import dev.ally.device.AssistantAgent
import org.junit.Assert.*
import org.junit.Test
class WidgetPresentationTest {
    private fun agent(id:String,status:String,unread:Boolean=false)=AssistantAgent(id,id,"codex",status,"",unread,0)
    @Test fun staleCacheNeverClaimsLiveAgents(){
        val p=WidgetPresentation.from(AssistantActivityState(listOf(agent("a","running")),stale=true,checked=true))
        assertEquals("Status unavailable",p.headline);assertTrue(p.detail.startsWith("Saved"))
        assertEquals("Ready when you are",WidgetPresentation.from(AssistantActivityState()).headline)
    }
    @Test fun realWaitingAgentsComeFirstDeduplicateAndLimitRows(){
        val p=WidgetPresentation.from(AssistantActivityState(listOf(agent("old","completed"),agent("run","running"),agent("ask","needs_input"),agent("run","running")),checked=true))
        assertEquals("2 active agents",p.headline)
        assertEquals(listOf("ask","run"),p.rows.map{it.id})
        assertEquals("1 needs your input",p.detail)
        assertEquals("All quiet",WidgetPresentation.from(AssistantActivityState(checked=true)).headline)
    }
}
