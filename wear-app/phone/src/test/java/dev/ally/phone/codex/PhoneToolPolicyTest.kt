package dev.ally.phone.codex

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject

class PhoneToolPolicyTest {
    private fun xml(pkg:String="com.example.notes",text:String="Notes",password:Boolean=false,focused:Boolean=false)="<?xml version='1.0'?><hierarchy><node package=\"$pkg\" text=\"$text\" content-desc=\"\" resource-id=\"\" password=\"$password\" focused=\"$focused\" bounds=\"[0,0][100,100]\"/></hierarchy>"
    private fun tap(x:Int=50)=JSONObject().put("type","tap").put("x",x).put("y",50)
    @Test fun ordinaryScreenAndTapAreAllowed(){val x=xml();assertEquals(x,PhoneToolPolicy.inspect(x));PhoneToolPolicy.validate(tap(),x,100,100,false)}
    @Test fun systemOnlyIsRefused(){assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.inspect(xml("com.android.systemui"))}}
    @Test fun unreadableScreenIsNotCalledALockScreen(){val e=assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.inspect(xml("com.android.systemui"))};assertEquals(PhoneToolPolicy.UNREADABLE,e.message)}
    @Test fun blindOperationsAreOnlyKeysAndSafeApps(){
        PhoneToolPolicy.validateBlind(JSONObject().put("type","key").put("key","home"))
        PhoneToolPolicy.validateBlind(JSONObject().put("type","open_app").put("packageName","com.google.android.calendar"))
        for(op in listOf(tap(),JSONObject().put("type","text").put("text","hi"),JSONObject().put("type","key").put("key","power"),JSONObject().put("type","open_app").put("packageName","dev.ally.phone")))
            assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validateBlind(op)}
    }
    @Test fun screensMentioningSignInOrPaymentAreReadable(){for(label in listOf("Sign in","Payment","Wallet","Unlock"))PhoneToolPolicy.inspect(xml(text=label));PhoneToolPolicy.inspect(xml(password=true))}
    @Test fun credentialFieldsAreNeverTyped(){for(x in listOf(xml(password=true,focused=true),xml(text="Verification code",focused=true),xml(text="Card number",focused=true)))assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(JSONObject().put("type","text").put("text","1234"),x,100,100,false)};PhoneToolPolicy.validate(JSONObject().put("type","text").put("text","hi"),xml(text="Message",focused=true),100,100,false)}
    @Test fun protectedPackagesRefused(){for(pkg in listOf("com.example.bank","com.android.permissioncontroller"))assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.inspect(xml(pkg))}}
    @Test fun allyTextMentioningSensitiveWordsIsReadable(){
        val x=xml("dev.ally.phone","Please unlock it, then sign in to pay");assertEquals(x,PhoneToolPolicy.inspect(x))
        assertEquals(xml(text="Please unlock it"),PhoneToolPolicy.inspect(xml(text="Please unlock it")))
    }
    @Test fun credentialNumericEntityIsNotABypass(){assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(JSONObject().put("type","text").put("text","x"),xml(text="p&#97;ssword",focused=true),100,100,false)}}
    @Test fun ownAppCanBeInspectedButNeverDecides(){val x=xml("dev.ally.phone","Approval needed");assertEquals(x,PhoneToolPolicy.inspect(x));assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(tap(),x,100,100,false)}}
    @Test fun arbitraryOwnAnswerLabelBlockedWhileReviewVisible(){assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(tap(),xml("dev.ally.phone","Banana"),100,100,true)}}
    @Test fun paymentsAndConsentRemainManual(){for(text in listOf("Pay","Pay now","Place order","Authorize","Send money"))assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(tap(),xml(text=text),100,100,false)}}
    @Test fun ordinaryAppActionsAreAllowed(){for(text in listOf("Send","Delete","Remove","Voice call","Submit","Allow"))PhoneToolPolicy.validate(tap(),xml(text=text),100,100,false)}
    @Test fun negativeAndOffscreenCoordinatesRefused(){for(x in listOf(-1,100,101))assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(tap(x),xml(),100,100,false)}}
    @Test fun cannotOpenOwnAppOrSecurityApp(){for(pkg in listOf("dev.ally.phone","com.android.systemui","com.example.bank"))assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(JSONObject().put("type","open_app").put("packageName",pkg),xml(),100,100,false)}}
    @Test fun cannotTypeAnswersOrNewlineSubmit(){for(text in listOf("yes","hello\n"))assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(JSONObject().put("type","text").put("text",text),xml(),100,100,true)}}
    @Test fun idleSystemUiFrameDoesNotBlockTapsButSystemControlsDo(){
        val frame={clickable:Boolean->"<?xml version='1.0'?><hierarchy><node package=\"com.google.android.calendar\" text=\"\" content-desc=\"Saturday 31 October\" resource-id=\"\" password=\"false\" focused=\"false\" bounds=\"[0,0][100,100]\"/><node package=\"com.android.systemui\" text=\"\" content-desc=\"\" resource-id=\"\" clickable=\"$clickable\" bounds=\"[50,0][100,100]\"/></hierarchy>"}
        PhoneToolPolicy.validate(tap(75),frame(false),100,100,false)
        assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(tap(75),frame(true),100,100,false)}
    }
    @Test fun swipeEndProtected(){val x=xml(text="Pay now");assertThrows(IllegalArgumentException::class.java){PhoneToolPolicy.validate(JSONObject().put("type","swipe").put("x",150).put("y",150).put("endX",50).put("endY",50),x,200,200,false)}}
    @Test fun proxyExactHostsOnly(){for(host in listOf("auth.openai.com","chatgpt.com","api.openai.com"))assertTrue(CodexConnectProxy.allowedDestination("$host:443"));for(host in listOf("evilchatgpt.com:443","api.openai.com.evil:443","127.0.0.1:443","chatgpt.com:80","chatgpt.com:443@evil:443"))assertFalse(CodexConnectProxy.allowedDestination(host))}
    @Test fun revisionChangesWhenUiChanges(){assertNotEquals(PhoneToolPolicy.revision(xml()),PhoneToolPolicy.revision(xml(text="Changed")))}
    @Test fun compactScreenKeepsLabelsAndTapCentresOnly(){
        val tree="<?xml version='1.0'?><hierarchy>"+
            "<node text=\"\" resource-id=\"\" class=\"android.widget.FrameLayout\" package=\"com.google.android.apps.nexuslauncher\" content-desc=\"\" clickable=\"false\" bounds=\"[0,0][1080,2400]\">"+
            "<node text=\"YouTube\" resource-id=\"com.google.android.apps.nexuslauncher:id/icon\" class=\"android.widget.TextView\" package=\"com.google.android.apps.nexuslauncher\" content-desc=\"YouTube\" clickable=\"true\" bounds=\"[100,200][300,400]\"/>"+
            "<node text=\"\" resource-id=\"\" class=\"android.view.View\" package=\"com.google.android.apps.nexuslauncher\" content-desc=\"Widgets\" clickable=\"false\" bounds=\"[0,500][1080,900]\"/>"+
            "</node></hierarchy>"
        assertEquals("app com.google.android.apps.nexuslauncher\n@200,300 200x200 TextView \"YouTube\" #icon [clickable]\n@540,700 1080x400 View (Widgets)",PhoneToolPolicy.compact(tree))
        assertTrue(PhoneToolPolicy.compact(tree).length<tree.length/2)
    }
    private val settingsTree="<?xml version='1.0'?><hierarchy>"+
        "<node text=\"\" class=\"android.widget.FrameLayout\" package=\"com.android.settings\" content-desc=\"\" clickable=\"false\" focused=\"false\" bounds=\"[0,0][1080,2400]\">"+
        "<node text=\"\" class=\"android.widget.LinearLayout\" package=\"com.android.settings\" content-desc=\"\" clickable=\"true\" focused=\"false\" bounds=\"[0,200][1080,400]\">"+
        "<node text=\"Wi-Fi\" class=\"android.widget.TextView\" package=\"com.android.settings\" content-desc=\"\" clickable=\"false\" focused=\"false\" bounds=\"[40,250][600,350]\"/>"+
        "<node text=\"\" class=\"android.widget.Switch\" package=\"com.android.settings\" content-desc=\"\" clickable=\"false\" focused=\"false\" bounds=\"[900,250][1040,350]\"/></node>"+
        "<node text=\"\" class=\"android.widget.LinearLayout\" package=\"com.android.settings\" content-desc=\"\" clickable=\"true\" focused=\"false\" bounds=\"[0,400][1080,600]\">"+
        "<node text=\"Display\" class=\"android.widget.TextView\" package=\"com.android.settings\" content-desc=\"\" clickable=\"false\" focused=\"false\" bounds=\"[40,450][600,550]\"/></node>"+
        "<node text=\"Forget\" class=\"android.widget.Button\" package=\"com.android.settings\" content-desc=\"\" clickable=\"true\" focused=\"false\" bounds=\"[700,1800][1000,1900]\"/>"+
        "</node></hierarchy>"
    @Test fun settingsCanBeBrowsedButChangesNeedConsent(){
        assertEquals(settingsTree,PhoneToolPolicy.inspect(settingsTree))
        PhoneToolPolicy.validateBlind(JSONObject().put("type","open_app").put("packageName","com.android.settings"))
        assertEquals("Change “Wi-Fi” in Settings",PhoneToolPolicy.settingsChange(JSONObject().put("type","tap").put("x",300).put("y",300),settingsTree))
        assertNull(PhoneToolPolicy.settingsChange(JSONObject().put("type","tap").put("x",300).put("y",500),settingsTree))
        assertEquals("Change “Forget” in Settings",PhoneToolPolicy.settingsChange(JSONObject().put("type","tap").put("x",800).put("y",1850),settingsTree))
        assertNull(PhoneToolPolicy.settingsChange(JSONObject().put("type","swipe").put("x",500).put("y",1500).put("endX",500).put("endY",700),settingsTree))
        assertNotNull(PhoneToolPolicy.settingsChange(JSONObject().put("type","text").put("text","hello"),settingsTree))
        assertNull(PhoneToolPolicy.settingsChange(JSONObject().put("type","tap").put("x",50).put("y",50),xml()))
    }
}
