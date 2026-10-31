package dev.ally.phone.codex

import org.json.JSONObject
import java.security.MessageDigest

/** Phone-side counterpart of desktop adb.ts. Every action checks a fresh tree. */
internal object PhoneToolPolicy {
    /** Credential entry stays manual: never type into these fields. */
    private val credential=Regex("password|passcode|\\bpin\\b|one.time|\\botp\\b|verification code|security code|card number|cvv|cvc",RegexOption.IGNORE_CASE)
    private val blocked=Regex("permissioncontroller|packageinstaller|authenticator|password|keychain|bank|wallet",RegexOption.IGNORE_CASE)
    /** Settings apps are usable; changing anything in them needs the user's yes first (see settingsChange). */
    private val settingsApp=Regex("settings",RegexOption.IGNORE_CASE)
    private val toggle=Regex("(Switch|CheckBox|RadioButton|SeekBar|ToggleButton|CompoundButton|Slider)$")
    private fun box(node:String)=Regex("\\[(-?\\d+),(-?\\d+)]\\[(-?\\d+),(-?\\d+)]").matchEntire(attr(node,"bounds"))?.groupValues?.drop(1)?.map(String::toInt)
    /** Paying, buying, transferring money, or granting an app or account access. Sending, deleting and removing are allowed. */
    private val action=Regex("\\b(pay|pay now|buy|buy now|purchase|checkout|place order|send money|transfer|authori[sz]e|grant access)\\b",RegexOption.IGNORE_CASE)
    private val decision=Regex("\\b(approv\\w*|allow\\w*|deny|denied|reject\\w*|decline\\w*|accept\\w*|grant\\w*|permit\\w*|authori[sz]\\w*|consent\\w*|always|once|answer\\w*|decision\\w*|interaction\\w*|yes|no|don't|dont|skip|choose|choice|option\\w*)\\b",RegexOption.IGNORE_CASE)
    private val shown=Regex("your approval|approval needed|needs your answer|answer this request|continue on this phone|\\b(approval|question|permission)\\b",RegexOption.IGNORE_CASE)
    private fun nodes(xml:String)=Regex("<node\\b[^>]*>").findAll(xml).map { it.value }.toList()
    private fun attr(node:String,name:String)=Regex("\\b$name=\"([^\"]*)\"").find(node)?.groupValues?.get(1).orEmpty()
    private fun labels(node:String)=listOf("text","content-desc","resource-id").joinToString(" "){attr(node,it)}.let { text ->
        Regex("&#(?:x([0-9a-fA-F]+)|(\\d+));").replace(text){ m -> runCatching { String(Character.toChars((m.groupValues[1].ifEmpty {m.groupValues[2]}).toInt(if(m.groupValues[1].isEmpty())10 else 16))) }.getOrDefault("") }
    }
    fun inspect(xml:String):String {
        require(xml.length<=1_000_000 && xml.startsWith("<?xml") && xml.contains("</hierarchy>")) {"Screen unavailable"}
        val nodes=nodes(xml)
        // The lock state is checked separately; here nothing but system bars means the app in front can't be read.
        require(nodes.isNotEmpty() && nodes.any { attr(it,"package").let { p->p.isNotBlank() && p!="com.android.systemui" } }) {UNREADABLE}
        // Screens are readable even when they mention unlock, payment or sign-in (a launcher's Wallet icon,
        // WhatsApp's Payments). Credential typing and Ally's decision controls are refused in validate().
        require(nodes.none { val p=attr(it,"package"); !p.startsWith("dev.ally.") && blocked.containsMatchIn(p) }) {"Protected app: continue manually"}
        return Regex("<node\\b[^>]*package=\"com.android.systemui\"[^>]*>").replace(xml) { m->Regex("(text|content-desc)=\"[^\"]*\"").replace(m.value,"$1=\"\"") }
    }
    /**
     * What the model reads: one line per node that has a label or can be used, with its centre to tap.
     * The raw tree (~20 KB a view) filled a phone chat's context in one request; the revision still covers it.
     */
    fun compact(xml:String):String {
        val bounds=Regex("\\[(\\d+),(\\d+)]\\[(\\d+),(\\d+)]")
        val rows=nodes(xml).mapNotNull { n ->
            val text=attr(n,"text");val desc=attr(n,"content-desc")
            val flags=listOf("clickable","editable","scrollable","checked","selected").filter{attr(n,it)=="true"}
            if(text.isBlank() && desc.isBlank() && flags.isEmpty()) return@mapNotNull null
            val b=bounds.find(attr(n,"bounds"))?.groupValues?.drop(1)?.map(String::toInt) ?: return@mapNotNull null
            if(b[2]<=b[0] || b[3]<=b[1]) return@mapNotNull null
            val id=attr(n,"resource-id").substringAfter(":id/","").takeIf(String::isNotBlank)
            buildString {
                append("@${(b[0]+b[2])/2},${(b[1]+b[3])/2} ${b[2]-b[0]}x${b[3]-b[1]} ${attr(n,"class").substringAfterLast('.')}")
                if(text.isNotBlank())append(" \"${text.take(160)}\"")
                if(desc.isNotBlank() && desc!=text)append(" (${desc.take(160)})")
                if(id!=null)append(" #$id")
                if(flags.isNotEmpty())append(" [${flags.joinToString(",")}]")
            }
        }
        val app=nodes(xml).map{attr(it,"package")}.firstOrNull{it.isNotBlank() && it!="com.android.systemui"}.orEmpty()
        return (listOf("app $app") + rows).joinToString("\n").take(12000)
    }
    /**
     * A description of the setting this operation would change, or null when it only reads, scrolls or
     * opens a page. Typing, toggles/switches/sliders (or a row holding one) and dialog buttons count as changes.
     */
    fun settingsChange(op:JSONObject,xml:String):String? {
        val rows=nodes(xml)
        val app=rows.map{attr(it,"package")}.firstOrNull{it.isNotBlank() && it!="com.android.systemui" && !it.startsWith("dev.ally.")} ?: return null
        if(!settingsApp.containsMatchIn(app)) return null
        fun label(n:String)=listOf(attr(n,"text"),attr(n,"content-desc")).firstOrNull(String::isNotBlank)
        return when(op.optString("type")) {
            "text"->"Type \"${op.optString("text").take(80)}\"" + (rows.firstOrNull{attr(it,"focused")=="true"}?.let(::label)?.let{" into “${it.take(80)}”"} ?: "") + " in Settings"
            "tap","swipe"->{
                val x=op.getInt("x");val y=op.getInt("y")
                fun inside(b:List<Int>?,px:Int,py:Int)=b!=null && px>=b[0] && px<b[2] && py>=b[1] && py<b[3]
                val under=rows.filter{inside(box(it),x,y) && attr(it,"package")==app}
                val area={n:String->box(n)!!.let{(it[2]-it[0]).toLong()*(it[3]-it[1])}}
                val target=under.filter{attr(it,"clickable")=="true"}.minByOrNull(area) ?: under.minByOrNull(area) ?: return null
                val tb=box(target)!!
                val within=rows.filter{n->box(n)?.let{it[0]>=tb[0] && it[1]>=tb[1] && it[2]<=tb[2] && it[3]<=tb[3]}==true}
                val changes=if(op.optString("type")=="swipe") under.any{toggle.containsMatchIn(attr(it,"class"))}
                    else toggle.containsMatchIn(attr(target,"class")) || attr(target,"class").endsWith("Button") || within.any{toggle.containsMatchIn(attr(it,"class"))}
                if(!changes) return null
                val name=label(target) ?: within.firstNotNullOfOrNull(::label) ?: "this control"
                "${if(op.optString("type")=="swipe")"Adjust" else "Change"} “${name.take(80)}” in Settings"
            }
            else->null
        }
    }
    const val UNREADABLE="The phone is unlocked, but the app in front can't be read (often Ally itself). Use perform with key home/back/recents or open_app packageName; those don't need a readable screen."
    /** Operations that don't depend on screen content, checked without a readable screen. */
    fun validateBlind(op:JSONObject) {
        when(op.getString("type")) {
            "key"->require(op.getString("key") in setOf("home","back","recents")) {"Unsupported key"}
            "open_app"->{val p=op.getString("packageName"); require(p.matches(Regex("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z0-9_]+)+")) && !p.startsWith("dev.ally.") && !blocked.containsMatchIn(p) && p!="com.android.systemui") {"Protected app"}}
            else->throw IllegalArgumentException("Taps, swipes and typing need a readable screen. Press Home or open the app first.")
        }
    }
    fun revision(xml:String)=MessageDigest.getInstance("SHA-256").digest(xml.toByteArray()).joinToString(""){"%02x".format(it)}
    fun validate(op:JSONObject,xml:String,width:Int,height:Int,approvalVisible:Boolean) {
        val type=op.getString("type"); require(type in setOf("tap","swipe","text","key","open_app")) {"Unsupported operation"}
        val rows=nodes(inspect(xml)); val decisionShown=approvalVisible || rows.any { attr(it,"package").startsWith("dev.ally.") && shown.containsMatchIn(labels(it)) }
        if(type=="open_app") {
            val p=op.getString("packageName"); require(p.matches(Regex("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z0-9_]+)+")) && !p.startsWith("dev.ally.") && !blocked.containsMatchIn(p) && p!="com.android.systemui") {"Protected app"}
        }
        if(type=="key") require(op.getString("key") in setOf("home","back","recents")) {"Unsupported key"}
        if(type=="text") {
            val t=op.getString("text"); require(t.length in 1..200 && t.all {it.code in 32..126}) {"Text supports 1–200 basic Latin characters"}
            require(rows.none {attr(it,"focused")=="true" && (attr(it,"password")=="true" || credential.containsMatchIn(labels(it)+" "+attr(it,"hint")))}) {"Credential field: enter it manually"}
            require(!decisionShown || rows.any {attr(it,"focused")=="true" && !attr(it,"package").startsWith("dev.ally.")}) {"Answer Ally's own request yourself"}
        }
        if(type in setOf("tap","swipe")) {
            val points= mutableListOf(op.getInt("x") to op.getInt("y")); if(type=="swipe") points+=op.getInt("endX") to op.getInt("endY")
            require(points.all {(x,y)->x in 0 until width && y in 0 until height}) {"Coordinates outside screen"}
            rows.forEach { node ->
                // SystemUI is protected where it can be touched; an empty, non-clickable frame (an idle volume dialog) is not.
                val p=attr(node,"package"); val systemUi=p=="com.android.systemui" && (attr(node,"clickable")=="true" || labels(node).isNotBlank()); val deny=systemUi || action.containsMatchIn(labels(node)) || (p.startsWith("dev.ally.") && (decisionShown || decision.containsMatchIn(labels(node))))
                val b=Regex("\\[(-?\\d+),(-?\\d+)\\]\\[(-?\\d+),(-?\\d+)\\]").matchEntire(attr(node,"bounds"))?.groupValues?.drop(1)?.map(String::toInt)
                if(deny && b!=null) require(points.none {(x,y)->x>=b[0] && x<b[2] && y>=b[1] && y<b[3]}) {"Protected control: complete manually"}
            }
        }
    }
}
