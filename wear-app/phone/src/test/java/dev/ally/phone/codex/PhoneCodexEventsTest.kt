package dev.ally.phone.codex
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class PhoneCodexEventsTest {
    private fun item(id:String,type:String="agentMessage",phase:String="final_answer",text:String="")=JSONObject().put("item",JSONObject().put("id",id).put("type",type).put("phase",phase).put("text",text))
    @Test fun commentaryIsPublishedOnceAndNotMixedIntoFinalSpeech(){val t=JSONObject();val p=item("c",phase="commentary",text="Checking now");repeat(2){PhoneCodexEvents.accept(t,"item/completed",p)};assertEquals(1,t.getJSONArray("progress").length());assertEquals("",t.getString("liveText"));PhoneCodexEvents.accept(t,"item/completed",item("a",text="Done"));assertEquals("Done",t.getString("liveText"))}
    @Test fun multipleFinalItemsAndDeltasRetainTheWholeAnswer(){val t=JSONObject();PhoneCodexEvents.accept(t,"item/completed",item("a",text="First part"));PhoneCodexEvents.accept(t,"item/agentMessage/delta",JSONObject().put("itemId","b").put("delta","Second"));PhoneCodexEvents.accept(t,"item/completed",item("b",text="Second part"));assertEquals("First part\n\nSecond part",t.getString("liveText"))}
    @Test fun privateReasoningAndToolPayloadsDoNotLeakIntoText(){val t=JSONObject();PhoneCodexEvents.accept(t,"item/completed",item("r","reasoning",text="private"));val p=item("tool","mcpToolCall",text="secret result").also{it.getJSONObject("item").put("tool","phone_control")};PhoneCodexEvents.accept(t,"item/started",p);PhoneCodexEvents.accept(t,"item/completed",p);assertEquals("done",t.getJSONArray("steps").getJSONObject(0).getString("status"));assertFalse(t.toString().contains("secret result"));assertFalse(t.toString().contains("private"))}
}
