package dev.ally.watch

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.isSpecified
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text as WearText

internal val Ink = Color(0xFF08090B)
internal val White = Color(0xFFECECEE)
internal val Muted = Color(0xFF929296)
internal val Panel = Color(0xFF141518)
internal val Hairline = Color.White.copy(alpha = .12f)
internal val Sunset = Color(0xFFFF6B35)
internal val Rose = Color(0xFFF72585)
internal val Amber = Color(0xFFFFB347)
internal val Geist = FontFamily(Font(R.font.geist_regular), Font(R.font.geist_medium, FontWeight.Medium))
internal val Mono = FontFamily(Font(R.font.geist_mono))
internal val Tanker = FontFamily(Font(R.font.tanker))

@Composable
internal fun Text(text: String, modifier: Modifier = Modifier, color: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified, lineHeight: TextUnit = TextUnit.Unspecified,
    letterSpacing: TextUnit = TextUnit.Unspecified, maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip, textAlign: TextAlign? = null, fontFamily: FontFamily = Geist) {
    WearText(text, modifier = modifier, color = color, fontSize = fontSize,
        lineHeight = if (lineHeight.isSpecified) lineHeight else if (fontSize.isSpecified) fontSize * 1.35f else TextUnit.Unspecified,
        letterSpacing = letterSpacing, maxLines = maxLines, overflow = overflow, textAlign = textAlign,
        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = fontFamily))
}

/** Inward light from Ally's Orbit palette; no offscreen blur or continuous idle animation. */
@Composable
internal fun PresenceGlow(active: Boolean, look: WatchLook) {
    if (!active || look.glow == GlowLevel.OFF) return
    Canvas(Modifier.fillMaxSize()) {
        val radius = size.maxDimension * .52f
        drawCircle(Brush.radialGradient(0f to Color.Transparent, .83f to Color.Transparent,
            .95f to look.palette.colors[0].copy(alpha = .08f * look.glow.strength),
            1f to look.palette.colors[1].copy(alpha = .23f * look.glow.strength),
            center = center, radius = radius), radius)
    }
}

/** Static phone-style flow strokes; no new idle animation or ambient work. */
@Composable
internal fun FlowBackdrop(look: WatchLook) {
    if(!look.backdrop) return
    Canvas(Modifier.fillMaxSize()) {
        val step=28.dp.toPx()
        for(x in 0..(size.width/step).toInt()) for(y in 0..(size.height/step).toInt()) {
            val px=x*step;val py=y*step
            val angle=kotlin.math.atan2(py-size.height*.42f,px-size.width*.55f)+.8f
            drawLine(look.palette.colors[1].copy(alpha=.055f),androidx.compose.ui.geometry.Offset(px,py),androidx.compose.ui.geometry.Offset(px+kotlin.math.cos(angle)*7.dp.toPx(),py+kotlin.math.sin(angle)*7.dp.toPx()),1.dp.toPx(),androidx.compose.ui.graphics.StrokeCap.Round)
        }
    }
}
