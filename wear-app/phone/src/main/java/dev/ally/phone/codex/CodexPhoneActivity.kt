package dev.ally.phone.codex

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.ally.device.DeviceLink
import dev.ally.phone.*

class CodexPhoneActivity:ComponentActivity(){
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);PhoneCodex.install(this)
        setContent {val state by PhoneCodex.status.collectAsState();val look=remember{PhoneLook.load(DeviceLink.prefs(this))}
            CompositionLocalProvider(LocalPhoneLook provides look){MaterialTheme(colorScheme=darkColorScheme(primary=White,onPrimary=Ink,background=Ink,surface=Panel,onSurface=White)){
                Surface(Modifier.fillMaxSize(),color=Ink){Column(Modifier.padding(24.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(20.dp)){
                    PresenceOrb(Modifier.size(64.dp));MicroLabel("Codex · on this phone")
                    Text("Your phone agent",style=MaterialTheme.typography.headlineMedium)
                    var auto by remember {mutableStateOf(DeviceLink.prefs(this@CodexPhoneActivity).getBoolean("phone.codex.autoRoute",true))}
                    Row {Checkbox(checked=auto,onCheckedChange={auto=it;DeviceLink.prefs(this@CodexPhoneActivity).edit().putBoolean("phone.codex.autoRoute",it).apply()});Text("Route explicit phone requests here when signed in")}
                    Text(state.message)
                    Text("Sign in separately with your Codex account. Phone chats stay on this phone. Commands and private file access are disabled; phone actions require your review.",color=Muted)
                    if(state.userCode.isNotBlank()){
                        Text("Sign-in code");SelectionContainer{Text(state.userCode,style=MaterialTheme.typography.headlineLarge)}
                        Button(onClick={val uri=Uri.parse(state.verificationUrl);if(uri.scheme=="https" && uri.host in setOf("auth.openai.com","chatgpt.com","openai.com"))startActivity(Intent(Intent.ACTION_VIEW,uri))}){Text("Open Codex sign-in")}
                    }
                    if(!state.busy)Button(onClick={runCatching{PhoneCodex.signIn(this@CodexPhoneActivity)}.onFailure{PhoneCodex.status.value=state.copy(message=it.message?:"Could not start")}},enabled=PhoneCodex.available(this@CodexPhoneActivity),modifier=Modifier.fillMaxWidth()){Text(if(state.signedIn)"Check phone sign-in" else "Sign in to Codex on this phone")}
                    if(state.busy)OutlinedButton(onClick={PhoneCodex.stopAll()},modifier=Modifier.fillMaxWidth()){Text("Stop phone Codex")}
                    if(state.signedIn && !state.busy)OutlinedButton(onClick={PhoneCodex.signOut(this@CodexPhoneActivity)},modifier=Modifier.fillMaxWidth()){Text("Sign out on this phone")}
                    Button(onClick={val id=PhoneCodex.create(this@CodexPhoneActivity);intent.getStringExtra("draft")?.takeIf{it.length<=12000}?.let{DeviceLink.prefs(this@CodexPhoneActivity).edit().putString("composer:$id",it).commit()};startActivity(Intent(this@CodexPhoneActivity,MainActivity::class.java).putExtra("openChat",id));finish()},enabled=state.signedIn && !state.busy,modifier=Modifier.fillMaxWidth()){Text("New phone chat")}
                    Text("PC chats continue running on PC. Use Phone Codex for phone tasks; desktop handoffs use the paired connection and a separate review. No automatic resend or provider switch.",color=Muted)
                    OutlinedButton(onClick={finish()},modifier=Modifier.fillMaxWidth()){Text("Back")}
                }}
            }}
        }
    }
}
