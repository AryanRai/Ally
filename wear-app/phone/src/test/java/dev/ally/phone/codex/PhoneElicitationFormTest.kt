package dev.ally.phone.codex
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
class PhoneElicitationFormTest {
    private fun form()=PhoneElicitationForm(JSONObject("""{"type":"object","properties":{"choice":{"type":"string","enum":["approve","deny"],"default":"approve"}},"required":["choice"]}"""))
    @Test fun aDefaultNeverBecomesAnAnswer(){assertNull(form().content(emptyMap()))}
    @Test fun onlyExplicitListedChoiceIsSubmitted(){assertEquals("approve",form().content(mapOf("choice" to "approve"))!!.getString("choice"));assertNull(form().content(mapOf("choice" to "always")))}
    @Test fun unknownRequiredOrNestedFieldFailsClosed(){for(schema in listOf("""{"required":["hidden"]}""","""{"properties":{"hidden":{"type":"object"}}}"""))assertThrows(IllegalArgumentException::class.java){PhoneElicitationForm(JSONObject(schema))}}
    @Test fun typedBooleansAndBoundsAreValidated(){val f=PhoneElicitationForm(JSONObject("""{"properties":{"allow":{"type":"boolean"},"minutes":{"type":"integer","minimum":1,"maximum":5}},"required":["allow","minutes"]}"""));assertEquals(false,f.content(mapOf("allow" to "false","minutes" to "2"))!!.getBoolean("allow"));assertNull(f.content(mapOf("allow" to "true","minutes" to "20")))}
}
