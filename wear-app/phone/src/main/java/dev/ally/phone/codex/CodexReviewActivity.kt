package dev.ally.phone.codex

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.ally.phone.*
import dev.ally.device.DeviceLink
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withTimeout
import java.util.UUID
import org.json.JSONObject

internal data class LocalDecision(val id:String,val title:String,val body:String,val form:PhoneElicitationForm,val answer:CompletableDeferred<JSONObject?>)
internal object PhoneLocalDecisions {
    val pending=MutableStateFlow<LocalDecision?>(null)
    suspend fun review(context:Context,title:String,body:String):Boolean = ask(context,title,body,PhoneElicitationForm(JSONObject()))!=null
    suspend fun elicit(context:Context,params:JSONObject):JSONObject {
        require(params.optString("serverName")=="ally_phone") {"Unknown phone MCP server"}
        require(params.optString("mode") in setOf("form","openai/form","openaiForm")) {"URL approvals must be completed manually"}
        val form=PhoneElicitationForm(params.getJSONObject("requestedSchema"))
        val answer=ask(context,"Codex tool approval",params.optString("message").take(6000),form)
        return JSONObject().put("action",if(answer==null)"decline" else "accept").put("content",answer?:JSONObject.NULL).put("_meta",JSONObject.NULL)
    }
    private suspend fun ask(context:Context,title:String,body:String,form:PhoneElicitationForm):JSONObject? {
        check(pending.value==null) {"Another phone approval needs your answer"}
        val item=LocalDecision(UUID.randomUUID().toString(),title,body,form,CompletableDeferred())
        pending.value=item
        try {
            // A heads-up notification, like Ally's other approvals: opening a window here would pull the user,
            // and the screen the agent is working on, away mid-task. Tapping it opens the review.
            CodexPhoneService.reviewNotice(context,item)
            return withTimeout(300_000){item.answer.await()}
        } finally {if(pending.value?.id==item.id)pending.value=null;CodexPhoneService.clearReview(context)}
    }
    fun cancel(){pending.value?.answer?.cancel();pending.value=null}
    /** Notification answer: only the decision it was posted for, and only a plain yes/no. */
    fun answerFromNotification(id:String,decision:String):Boolean {
        val item=pending.value?.takeIf{it.id==id && it.form.fields.isEmpty() && decision in setOf("allow","deny")} ?: return false
        return item.answer.complete(if(decision=="allow")JSONObject() else null)
    }
}
class PhoneDecisionReceiver:android.content.BroadcastReceiver() {
    override fun onReceive(context:Context,intent:android.content.Intent) {
        if(context.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked)return
        val id=intent.getStringExtra("id")?:return; val decision=intent.getStringExtra("decision")?:return
        if(PhoneLocalDecisions.answerFromNotification(id,decision))CodexPhoneService.clearReview(context)
    }
}
class CodexReviewActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);setContent {
        val pending by PhoneLocalDecisions.pending.collectAsState()
        val look=remember {PhoneLook.load(DeviceLink.prefs(this))}
        CompositionLocalProvider(LocalPhoneLook provides look){MaterialTheme(colorScheme=darkColorScheme(primary=White,background=Ink,surface=Panel,onSurface=White)) {
            Surface(Modifier.fillMaxSize(),color=Ink){Column(Modifier.padding(24.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(20.dp)) {
                MicroLabel("Ally · phone Codex")
                Text("Approval needed",style=MaterialTheme.typography.headlineSmall)
                pending?.let {p->Text(p.title);Text(p.body);Text("Only you can answer. The phone agent cannot press these buttons.",color=Muted)
                    var values by remember(p.id){mutableStateOf(emptyMap<String,String>())}
                    p.form.fields.forEach {f->Text(f.title)
                        val options=if(f.type=="boolean")listOf("true","false") else f.options
                        if(options.isNotEmpty()) options.forEach{value->FilterChip(selected=values[f.id]==value,onClick={values=values+(f.id to value)},label={Text(value)})}
                        else OutlinedTextField(value=values[f.id].orEmpty(),onValueChange={if(it.length<=4000)values=values+(f.id to it)},label={Text(if(f.required)"Required" else "Optional")},modifier=Modifier.fillMaxWidth())
                    }
                    val content=p.form.content(values)
                    Button(onClick={p.answer.complete(content);finish()},enabled=content!=null,modifier=Modifier.fillMaxWidth()){Text(if(p.form.fields.isEmpty())"Allow for this request" else "Submit my choice")}
                    OutlinedButton(onClick={p.answer.complete(null);finish()},modifier=Modifier.fillMaxWidth()){Text("Deny")}
                }?:Text("No approval is pending")
            }}
        }}
    }}
}
