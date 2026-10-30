package dev.ally.phone

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlin.math.cos
import kotlin.math.sin

/** Shared rendering for the hold-to-talk control and non-interactive appearance previews. */
@Composable
internal fun StyledPhoneOrb(look: PhoneLook, active: Boolean, listening: Boolean, microphoneLevel: Float, modifier: Modifier = Modifier, speaking: Boolean = false) {
    val level by animateFloatAsState(if (look.reducedMotion) 0f else microphoneLevel, tween(100), label = "microphone level")
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val moving = !look.reducedMotion && lifecycleState.isAtLeast(Lifecycle.State.STARTED) &&
        active
    val rotation = if (moving) {
        val transition = rememberInfiniteTransition(label = "orb")
        val value by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(if(speaking) 2100 else 4500, easing = LinearEasing)), label = "halo")
        value
    } else 35f
    Canvas(modifier) { drawPhoneOrb(look,listening,speaking,level,rotation) }
}

/** Shared, deterministic frame for the app Canvas and home-screen widget. */
internal fun androidx.compose.ui.graphics.drawscope.DrawScope.drawPhoneOrb(look:PhoneLook,listening:Boolean=false,speaking:Boolean=false,level:Float=0f,rotation:Float=35f) {
        val r = size.minDimension * (if(listening) .36f + level * .12f else if(speaking) .36f + level * .12f + .025f * sin(rotation * Math.PI / 90).toFloat() else .47f)
        val angle = rotation * Math.PI / 180
        val drift = Offset((cos(angle) * r * .2).toFloat(), (sin(angle) * r * .18).toFloat())
        val colors = look.palette.colors
        val (warm, pink, gold) = colors
        when (look.style) {
            OrbStyle.ENERGY -> {
                drawCircle(Brush.radialGradient(listOf(pink.copy(alpha = .6f), pink.copy(alpha = .16f), Color.Transparent), center + drift, r), r, center + drift)
                drawCircle(Brush.radialGradient(listOf(warm.copy(alpha = .95f), warm.copy(alpha = .5f), Color.Transparent), center - drift, r * .8f), r * .8f, center - drift)
                val highlight = center + Offset(-r * .15f, -r * .2f)
                drawCircle(Brush.radialGradient(listOf(gold.copy(alpha = .95f), gold.copy(alpha = .3f), Color.Transparent), highlight, r * .55f), r * .55f, highlight)
            }
            OrbStyle.SIRI -> {
                drawCircle(Brush.radialGradient(listOf(warm.copy(alpha = .65f), pink.copy(alpha = .18f), Color.Transparent), center, r), r)
                val ring = Path()
                for (i in 0..100) {
                    val a = i * Math.PI * 2 / 100
                    val radius = r * (.65 + .12 * sin(a * 3 + angle))
                    val x = center.x + (cos(a) * radius).toFloat()
                    val y = center.y + (sin(a) * radius).toFloat()
                    if (i == 0) ring.moveTo(x, y) else ring.lineTo(x, y)
                }
                ring.close()
                drawPath(ring, Brush.sweepGradient(colors + warm, center), style = Stroke(r * .12f))
                drawCircle(gold.copy(alpha = .7f), r * .13f, center - drift)
            }
            OrbStyle.CLOUD -> {
                drawCircle(Brush.radialGradient(listOf(pink.copy(alpha = .4f), Color.Transparent), center, r), r)
                colors.forEachIndexed { index, color ->
                    val wave = Path()
                    for (i in 0..60) {
                        val t = i / 60f
                        val x = center.x + (t * 2 - 1) * r * .85f
                        val envelope = sin(t * Math.PI)
                        val y = center.y + (sin(t * Math.PI * 2 + angle + index * 1.7) * envelope * r * .38).toFloat()
                        if (i == 0) wave.moveTo(x, y) else wave.lineTo(x, y)
                    }
                    drawPath(wave, color.copy(alpha = .18f), style = Stroke(r * .32f, cap = androidx.compose.ui.graphics.StrokeCap.Round))
                    drawPath(wave, color.copy(alpha = .9f), style = Stroke(r * .07f, cap = androidx.compose.ui.graphics.StrokeCap.Round))
                }
            }
            OrbStyle.PIXEL -> {
                val cell = r * .23f
                val pixels = listOf("0011100", "0111110", "1111111", "1111111", "1111111", "0111110", "0011100")
                pixels.forEachIndexed { row, line -> line.forEachIndexed { col, value ->
                    if (value == '1') drawRect(colors[(row / 3).coerceAtMost(2)],
                        center + Offset((col - 3.5f) * cell, (row - 3.5f) * cell), Size(cell * .87f, cell * .87f))
                } }
            }
        }
        if (speaking) {
            drawCircle(Brush.radialGradient(listOf(colors[0].copy(alpha=.15f + level*.35f), Color.Transparent), center, r*1.3f), r*1.3f)
            drawArc(colors[2].copy(alpha=.55f + level*.4f), rotation, 110f + level*90f, false,
                topLeft=center-Offset(r*.9f,r*.9f), size=Size(r*1.8f,r*1.8f), style=Stroke(2.dp.toPx()+level*3.dp.toPx()))
        }
        if (listening) {
            for(i in -2..2) {
                val height = r * (.15f + level * (.85f - kotlin.math.abs(i)*.2f))
                drawLine(colors[2], center+Offset(i*r*.22f,-height/2), center+Offset(i*r*.22f,height/2), 3.dp.toPx(), cap=androidx.compose.ui.graphics.StrokeCap.Round)
            }
        }
        if (listening && look.listeningEyes) {
            for (x in listOf(-.17f, .17f)) drawRoundRect(Ink.copy(alpha = .8f),
                topLeft = center + Offset(r * x - 2.dp.toPx(), -4.dp.toPx()),
                size = Size(4.dp.toPx(), 8.dp.toPx()), cornerRadius = CornerRadius(2.dp.toPx()))
        }
}
