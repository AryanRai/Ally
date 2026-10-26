package dev.ally.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.wear.ambient.AmbientLifecycleObserver
import dev.ally.device.DeviceLink
import dev.ally.device.SurfaceStatus
import kotlinx.coroutines.delay
import java.util.Date
import kotlin.math.cos
import kotlin.math.sin

/** Ambient state reported by Wear OS. `tick` advances once per ambient update (about a minute). */
class AmbientController : AmbientLifecycleObserver.AmbientLifecycleCallback {
    var ambient by mutableStateOf(false); private set
    var burnIn by mutableStateOf(false); private set
    var lowBit by mutableStateOf(false); private set
    var tick by mutableLongStateOf(0L); private set
    override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
        burnIn = ambientDetails.burnInProtectionRequired; lowBit = ambientDetails.deviceHasLowBitAmbient; tick++; ambient = true
    }
    override fun onUpdateAmbient() { tick++ }
    override fun onExitAmbient() { ambient = false }
}

/** Mirrors the activity lifecycle but holds the interactive UI at CREATED while ambient, pausing its polling and animation. */
private class AmbientGatedLifecycle(private val parent: Lifecycle) : LifecycleOwner {
    private val registry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = registry
    var capped = false; set(value) { field = value; sync() }
    private val observer = LifecycleEventObserver { _, _ -> sync() }
    fun attach() { parent.addObserver(observer) }
    fun detach() { parent.removeObserver(observer) }
    private fun sync() {
        val state = parent.currentState
        val target = if(capped && state.isAtLeast(Lifecycle.State.STARTED)) Lifecycle.State.CREATED else state
        if(registry.currentState != Lifecycle.State.DESTROYED && !(registry.currentState == Lifecycle.State.INITIALIZED && target == Lifecycle.State.DESTROYED)) registry.currentState = target
    }
}

/** Keeps the interactive app composed (its saved state survives) and covers it with the always-on screen. */
@Composable
internal fun AmbientHost(controller: AmbientController, model: WatchViewModel, content: @Composable () -> Unit) {
    val parent = LocalLifecycleOwner.current.lifecycle
    val gated = remember(parent) { AmbientGatedLifecycle(parent) }
    DisposableEffect(gated) { gated.attach(); onDispose { gated.detach() } }
    SideEffect { gated.capped = controller.ambient }
    CompositionLocalProvider(LocalLifecycleOwner provides gated) { content() }
    if(controller.ambient) {
        val own by model.state.collectAsState()
        AmbientScreen(own, controller.tick, controller.burnIn, controller.lowBit)
    }
}

@Composable
private fun AmbientScreen(own: WatchState, tick: Long, burnIn: Boolean, lowBit: Boolean) {
    val context = LocalContext.current
    var snapshot by remember { mutableStateOf(SurfaceStatus.load(context)) }
    val changes = remember { kotlinx.coroutines.flow.MutableStateFlow(0) }
    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() { override fun onReceive(c: Context, i: Intent) { changes.value++ } }
        val filter = IntentFilter(context.packageName + ".SURFACE_CHANGED")
        if(Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED) else context.registerReceiver(receiver, filter)
        onDispose { context.unregisterReceiver(receiver) }
    }
    // Low update rate: coalesce live feed changes into one redraw every few seconds.
    LaunchedEffect(Unit) { changes.collect { snapshot = SurfaceStatus.load(context); delay(5000) } }
    val connected = DeviceLink.status.collectAsState().value == "Connected"
    val presence = remember(snapshot, own, connected) {
        AmbientPresenceModel.build(snapshot.state.chats, !connected && snapshot.state.stale, own)
    }
    val (dx, dy) = if(burnIn) AmbientPresenceModel.shift(tick) else 0 to 0
    val text = White.copy(alpha = if(lowBit) 1f else .86f)
    val dim = if(lowBit) White else Muted
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Box(Modifier.fillMaxSize().offset(dx.dp, dy.dp)) {
            AmbientHalo(presence.mood, own.look, tick, lowBit)
            Column(Modifier.fillMaxSize().padding(horizontal = 30.dp, vertical = 26.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("ALLY", color = dim, fontSize = 12.sp, fontFamily = Tanker, letterSpacing = 1.sp)
                Text(remember(tick) { android.text.format.DateFormat.getTimeFormat(context).format(Date()) }, color = text, fontSize = 22.sp, fontFamily = Mono)
                Spacer(Modifier.height(4.dp))
                when(presence.mood) {
                    AmbientMood.WORKING -> Row(verticalAlignment = Alignment.CenterVertically) {
                        AmbientSpinner(tick, own.look.palette.colors[0].takeUnless { lowBit } ?: White)
                        Spacer(Modifier.width(5.dp))
                        Text(AmbientPresenceModel.verb(tick), color = text, fontSize = 14.sp, maxLines = 1)
                    }
                    else -> Text(presence.headline, color = if(presence.mood == AmbientMood.ATTENTION && !lowBit) Amber else text, fontSize = 14.sp, maxLines = 1)
                }
                if(presence.mood == AmbientMood.WORKING) Text(presence.headline.uppercase(), color = dim, fontSize = 9.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, fontFamily = Mono, letterSpacing = 1.sp)
                if(presence.agents.isNotEmpty()) Spacer(Modifier.height(8.dp))
                presence.agents.forEach { agent ->
                    Text(agent.title, color = text, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                    Text(agent.status, color = if(agent.attention && !lowBit) Amber else dim, fontSize = 9.sp, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, fontFamily = Mono, modifier = Modifier.padding(bottom = 3.dp))
                }
                if(presence.note.isNotEmpty()) Text(presence.note, color = dim, fontSize = 9.sp, maxLines = 1)
            }
        }
    }
}

/** Thin outline halo: colour reflects activity; a short arc steps around it once per ambient update. */
@Composable
private fun AmbientHalo(mood: AmbientMood, look: WatchLook, tick: Long, lowBit: Boolean) {
    Canvas(Modifier.fillMaxSize()) {
        val stroke = 1.5.dp.toPx()
        val inset = 3.dp.toPx()
        val ring = Size(size.width - inset * 2, size.height - inset * 2)
        val tint = when(mood) {
            AmbientMood.WORKING -> look.palette.colors[1]
            AmbientMood.ATTENTION -> Amber
            AmbientMood.IDLE, AmbientMood.OFFLINE -> Muted
        }
        val color = if(lowBit) White else tint.copy(alpha = if(mood == AmbientMood.IDLE || mood == AmbientMood.OFFLINE) .3f else .55f)
        drawArc(color, 0f, 360f, false, Offset(inset, inset), ring,
            style = Stroke(stroke, pathEffect = if(mood == AmbientMood.OFFLINE) PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx())) else null))
        if(mood == AmbientMood.WORKING || mood == AmbientMood.ATTENTION) {
            val start = if(mood == AmbientMood.WORKING) (tick % 12) * 30f - 90f else -110f
            drawArc(if(lowBit) White else tint, start, if(mood == AmbientMood.WORKING) 38f else 40f, false, Offset(inset, inset), ring,
                style = Stroke(stroke * 2.4f, cap = StrokeCap.Round))
        }
    }
}

/** A Claude-style asterisk spinner that turns one notch per ambient update. */
@Composable
private fun AmbientSpinner(tick: Long, color: Color) {
    Canvas(Modifier.size(11.dp)) {
        val arms = 3 + (tick % 3).toInt()
        val r = size.minDimension / 2
        repeat(arms) { i ->
            val a = Math.toRadians((i * 180.0 / arms) + tick * 20.0)
            val d = Offset((cos(a) * r).toFloat(), (sin(a) * r).toFloat())
            drawLine(color, center - d, center + d, 1.4.dp.toPx(), StrokeCap.Round)
        }
    }
}
