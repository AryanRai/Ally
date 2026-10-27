package dev.ally.phone

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.*

// The desktop's neutral glass, Geist body, mono micro-labels and Tanker wordmark.
internal val Ink = Color(0xff0c0c0d)
internal val Panel = Color(0xff18181a)
internal val Line = Color.White.copy(alpha = .10f)
internal val Muted = Color(0xff99999e)
internal val White = Color(0xfff4f4f5)
internal val Warm = Color(0xffffad85)
internal val Geist = FontFamily(Font(R.font.geist_regular))
internal val Mono = FontFamily(Font(R.font.geist_mono))
internal val Tanker = FontFamily(Font(R.font.tanker))

@Composable
internal fun MicroLabel(text: String, modifier: Modifier = Modifier, color: Color = Muted) {
    Text(text.uppercase(), modifier, color = color, fontFamily = Mono, fontSize = 9.sp, letterSpacing = 1.4.sp, maxLines = 1)
}

/** Small line icons share the desktop's 1.5px stroke; every control has a 48dp target. */
@Composable
internal fun Glyph(name: String, modifier: Modifier = Modifier, color: Color = White) {
    Canvas(modifier.size(20.dp)) {
        val u = size.minDimension / 24f
        fun line(x: Float, y: Float, x2: Float, y2: Float) = drawLine(color, Offset(x*u,y*u), Offset(x2*u,y2*u), 1.5f*u, StrokeCap.Round)
        fun path(vararg points: Pair<Float,Float>) { val p = Path(); points.forEachIndexed { i, v -> if(i==0) p.moveTo(v.first*u,v.second*u) else p.lineTo(v.first*u,v.second*u) }; drawPath(p,color,style=Stroke(1.5f*u,cap=StrokeCap.Round,join=StrokeJoin.Round)) }
        when(name) {
            "styles" -> { drawCircle(color,8*u,Offset(12*u,12*u),style=Stroke(1.5f*u)); drawCircle(color,2*u,Offset(9*u,9*u)); drawCircle(color,2*u,Offset(16*u,11*u)); drawCircle(color,2*u,Offset(10*u,16*u)) }
            "menu" -> { line(4f,7f,20f,7f); line(4f,12f,15f,12f); line(4f,17f,20f,17f) }
            "back" -> { path(14f to 5f,7f to 12f,14f to 19f) }
            "close" -> { line(6f,6f,18f,18f); line(18f,6f,6f,18f) }
            "send" -> { line(12f,19f,12f,5f); path(6f to 11f,12f to 5f,18f to 11f) }
            "stop" -> drawRoundRect(color,Offset(6*u,6*u),androidx.compose.ui.geometry.Size(12*u,12*u),androidx.compose.ui.geometry.CornerRadius(2*u))
            "new" -> { path(14f to 4f,4f to 4f,4f to 20f,20f to 20f,20f to 10f); line(10f,14f,20f,4f); line(17f,3f,21f,7f) }
            "search" -> { drawCircle(color,6*u,Offset(10*u,10*u),style=Stroke(1.5f*u)); line(15f,15f,21f,21f) }
            "chat" -> path(4f to 4f,20f to 4f,20f to 17f,9f to 17f,4f to 21f,4f to 4f)
            "folder" -> path(3f to 6f,10f to 6f,12f to 9f,21f to 9f,21f to 19f,3f to 19f,3f to 6f)
            "inbox" -> { path(5f to 4f,19f to 4f,22f to 18f,22f to 20f,2f to 20f,2f to 18f,5f to 4f); path(3f to 15f,8f to 15f,10f to 18f,14f to 18f,16f to 15f,21f to 15f) }
            "settings" -> { repeat(3) { i -> val y=6f+i*6; line(3f,y,21f,y); drawCircle(Ink,3*u,Offset((if(i==1) 15f else 8f)*u,y*u)); drawCircle(color,2.5f*u,Offset((if(i==1) 15f else 8f)*u,y*u),style=Stroke(1.5f*u)) } }
            "shield" -> path(12f to 3f,20f to 6f,19f to 15f,12f to 21f,5f to 15f,4f to 6f,12f to 3f)
            "chevron" -> path(9f to 5f,16f to 12f,9f to 19f)
            "down" -> path(6f to 9f,12f to 15f,18f to 9f)
            "check" -> path(5f to 12f,10f to 17f,20f to 6f)
        }
    }
}

@Composable
internal fun IconControl(name: String, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    IconButton(onClick, Modifier.size(48.dp).semantics { contentDescription = label }, enabled = enabled) { Glyph(name, color = if(enabled) White else Muted.copy(alpha=.4f)) }
}

/** The same four styles as the watch, driven by this phone's saved appearance. */
@Composable
internal fun PresenceOrb(modifier: Modifier = Modifier, active: Boolean = false, microphoneLevel: Float = 0f, listening: Boolean = false) {
    StyledPhoneOrb(LocalPhoneLook.current, active, listening, microphoneLevel, modifier)
}

@Composable
internal fun PhoneActivityGlow(active: Boolean, modifier: Modifier = Modifier) {
    val look = LocalPhoneLook.current
    if (!active || look.glow == GlowLevel.OFF) return
    Canvas(modifier) {
        val radius = size.maxDimension * .75f
        val origin = Offset(size.width / 2, size.height)
        drawCircle(Brush.radialGradient(listOf(look.palette.colors[1].copy(alpha=.16f*look.glow.strength), Color.Transparent), origin, radius), radius, origin)
    }
}
/** Quiet flow strokes echo Ally's FlowField without compromising reading contrast. */
@Composable
internal fun FlowBackdrop(modifier: Modifier = Modifier) {
    if (!LocalPhoneLook.current.backdrop) return
    Canvas(modifier) {
        val step=28.dp.toPx()
        for(x in 0..(size.width/step).toInt()) for(y in 0..(size.height/step).toInt()) {
            val px=x*step; val py=y*step
            val angle=atan2(py-size.height*.42f,px-size.width*.55f)+.8f
            val alpha=if(py>size.height*.72f) .025f else .045f
            drawLine(White.copy(alpha=alpha),Offset(px,py),Offset(px+cos(angle)*7.dp.toPx(),py+sin(angle)*7.dp.toPx()),1.dp.toPx(),StrokeCap.Round)
        }
    }
}

internal fun folderName(path: String) = path.replace('\\','/').trimEnd('/').substringAfterLast('/').ifBlank { "Personal" }

@Composable
internal fun MessageBody(text: String) {
    val blocks = remember(text) { dev.ally.device.RichReplyContent.parse(text) }
    SelectionContainer {
        Column(Modifier.fillMaxWidth(), verticalArrangement=Arrangement.spacedBy(12.dp)) {
            blocks.forEach { block ->
                if (block.kind == "divider") Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
                else {
                    val code = block.kind == "code"
                    val framed = block.kind in setOf("code", "quote", "table")
                    val annotation = remember(block) { buildAnnotatedString {
                        append(block.prefix)
                        block.spans.forEach { span ->
                            withStyle(SpanStyle(fontWeight=if(span.bold) FontWeight.Bold else null,
                                fontStyle=if(span.italic) androidx.compose.ui.text.font.FontStyle.Italic else null,
                                fontFamily=if(span.code) Mono else null,background=if(span.code) Panel else Color.Unspecified)) {
                                if(span.url != null) withLink(LinkAnnotation.Url(span.url,TextLinkStyles(SpanStyle(color=Warm,textDecoration=TextDecoration.Underline)))) { append(span.text) }
                                else append(span.text)
                            }
                        }
                    } }
                    Column(Modifier.fillMaxWidth().padding(start=if(block.kind=="text") (block.level.coerceAtMost(3)*8).dp else 0.dp)
                        .then(if(framed) Modifier.border(1.dp,Line,RoundedCornerShape(8.dp)).background(Panel,RoundedCornerShape(8.dp)).padding(14.dp) else Modifier)) {
                        if(code && block.language.isNotBlank()) MicroLabel(block.language,Modifier.padding(bottom=10.dp))
                        Text(annotation,fontFamily=if(code) Mono else Geist,
                            fontWeight=if(block.kind=="heading") FontWeight.SemiBold else FontWeight.Normal,
                            fontSize=when { code -> 12.sp; block.kind=="heading" -> if(block.level<=2) 21.sp else 18.sp; else -> 15.sp },
                            lineHeight=if(code) 19.sp else 25.sp,color=White,
                            modifier=if(code) Modifier.horizontalScroll(rememberScrollState()) else Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
}
