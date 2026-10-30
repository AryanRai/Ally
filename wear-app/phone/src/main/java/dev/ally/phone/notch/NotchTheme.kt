package dev.ally.phone.notch

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.ally.phone.*

/** Same neutral surfaces, Geist type, mono labels and saved accent as the main phone app. */
@Composable internal fun NotchTheme(look: PhoneLook, content: @Composable () -> Unit) {
    val base=Typography()
    val type=base.copy(bodyLarge=base.bodyLarge.copy(fontFamily=Geist),bodyMedium=base.bodyMedium.copy(fontFamily=Geist),bodySmall=base.bodySmall.copy(fontFamily=Geist),titleLarge=base.titleLarge.copy(fontFamily=Geist),titleMedium=base.titleMedium.copy(fontFamily=Geist),titleSmall=base.titleSmall.copy(fontFamily=Geist),labelLarge=base.labelLarge.copy(fontFamily=Geist),labelMedium=base.labelMedium.copy(fontFamily=Geist),labelSmall=base.labelSmall.copy(fontFamily=Mono))
    CompositionLocalProvider(LocalPhoneLook provides look) {
        MaterialTheme(colorScheme=darkColorScheme(background=Ink,surface=Panel,onBackground=White,onSurface=White,onSurfaceVariant=Muted,primary=look.palette.colors[1],onPrimary=Ink,
            primaryContainer=look.palette.colors[0].copy(alpha=.22f),onPrimaryContainer=White,
            secondary=look.palette.colors[1],onSecondary=Ink,secondaryContainer=look.palette.colors[1].copy(alpha=.18f),onSecondaryContainer=White,
            tertiary=look.palette.colors[2],onTertiary=Ink,tertiaryContainer=look.palette.colors[2].copy(alpha=.18f),onTertiaryContainer=White,
            surfaceVariant=Panel,surfaceContainer=Panel,surfaceContainerHigh=Panel,surfaceContainerHighest=Panel,
            inversePrimary=look.palette.colors[1],surfaceTint=look.palette.colors[1],outline=Line,outlineVariant=Line),typography=type,content=content)
    }
}
@Composable internal fun NotchGroup(content: @Composable ColumnScope.() -> Unit) {
    Surface(shape=RoundedCornerShape(18.dp),color=Panel,border=BorderStroke(1.dp,Line)) {
        Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp),content=content)
    }
}
/** Static layered light: no animation, extra window, or change to button semantics. */
@Composable internal fun Modifier.notchAccent(active:Boolean=true, radius:Float=12f):Modifier {
    val look=LocalPhoneLook.current
    val colors=look.palette.colors
    val strength=if(active)look.glow.strength else 0f
    return this.drawBehind {
        if(strength>0f){
            for(layer in 1..4){
                val spread=layer*1.5f.dp.toPx()
                drawRoundRect(Brush.linearGradient(colors.map{it.copy(alpha=.045f*strength)}),
                    topLeft=Offset(-spread,-spread),size=Size(size.width+2*spread,size.height+2*spread),
                    cornerRadius=CornerRadius(radius.dp.toPx()+spread),style=Stroke((5-layer).dp.toPx()))
            }
        }
    }.background(Brush.linearGradient(colors.map{it.copy(alpha=if(active).12f else .035f)}),RoundedCornerShape(radius.dp))
        .border(1.dp,Brush.linearGradient(colors.map{it.copy(alpha=if(active).85f else .25f)}),RoundedCornerShape(radius.dp))
}
@Composable internal fun NotchButton(text:String, modifier:Modifier=Modifier.fillMaxWidth(), onClick:()->Unit) {
    OutlinedButton(onClick,modifier.heightIn(min=48.dp).notchAccent(),shape=RoundedCornerShape(12.dp),
        colors=ButtonDefaults.outlinedButtonColors(containerColor=Color.Transparent,contentColor=White),border=null) { Text(text,color=White) }
}
