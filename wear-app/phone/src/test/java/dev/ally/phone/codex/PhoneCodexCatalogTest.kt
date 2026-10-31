package dev.ally.phone.codex
import java.io.File
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
class PhoneCodexCatalogTest {
    @Test fun everyModelExposesDirectMcpWithNoPrivateFileOrCommandExecutor(){
        val models=JSONObject(File("src/main/assets/phone-codex-models.json").readText()).getJSONArray("models")
        assertTrue(models.length()>0)
        for(i in 0 until models.length()) {val m=models.getJSONObject(i);assertTrue(m.isNull("apply_patch_tool_type"));assertEquals("disabled",m.getString("shell_type"));assertEquals("direct",m.getString("tool_mode"));assertFalse(m.getBoolean("supports_search_tool"));assertTrue(m.getBoolean("node_repl_disabled"));assertEquals(0,m.getJSONArray("experimental_supported_tools").length())}
    }
}
