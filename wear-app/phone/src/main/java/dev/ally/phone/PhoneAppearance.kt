package dev.ally.phone

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun PhoneAppearance(modifier: Modifier, change: (PhoneLook)->Unit) {
    val look = LocalPhoneLook.current
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
        Column { MicroLabel("Make it yours"); Text("Styles",fontFamily=Geist,fontSize=29.sp,modifier=Modifier.padding(top=8.dp)) }
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).height(144.dp),contentAlignment=Alignment.Center) {
            PhoneActivityGlow(true,Modifier.matchParentSize())
            StyledPhoneOrb(look,true,true,.15f,Modifier.size(110.dp))
        }
        Text("Live preview · saved on this phone",color=Muted,fontSize=12.sp)
        MicroLabel("Orb style")
        Column(Modifier.selectableGroup(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            OrbStyle.entries.chunked(2).forEach { row ->
                Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                    row.forEach { style ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Panel)
                            .border(1.dp,if(look.style==style) White else Line,RoundedCornerShape(12.dp))
                            .selectable(look.style==style,role=Role.RadioButton) { change(look.copy(style=style)) }
                            .padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally) {
                            StyledPhoneOrb(look.copy(style=style),false,false,0f,Modifier.size(52.dp))
                            Text(style.label,fontSize=13.sp)
                        }
                    }
                }
            }
        }
        MicroLabel("Colour theme")
        Column(Modifier.selectableGroup(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            OrbPalette.entries.forEach { palette ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Panel)
                    .selectable(look.palette==palette,role=Role.RadioButton) { change(look.copy(palette=palette)) }
                    .padding(16.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    palette.colors.forEach { Box(Modifier.size(16.dp).background(it,CircleShape)) }
                    Text(palette.label,Modifier.weight(1f).padding(start=8.dp),fontSize=14.sp)
                    if(look.palette==palette) Glyph("check",Modifier.size(16.dp))
                }
            }
        }
        MicroLabel("Activity glow")
        Row(Modifier.selectableGroup().fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            GlowLevel.entries.forEach { glow ->
                Box(Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(if(look.glow==glow) White else Panel)
                    .selectable(look.glow==glow,role=Role.RadioButton) { change(look.copy(glow=glow)) }.heightIn(min=48.dp),contentAlignment=Alignment.Center) {
                    Text(glow.label,color=if(look.glow==glow) Ink else White,fontSize=12.sp)
                }
            }
        }
        ToggleRow("Listening eyes","Show a face while you talk",look.listeningEyes) { change(look.copy(listeningEyes=it)) }
        ToggleRow("Reduced motion","Keep the orb still",look.reducedMotion) { change(look.copy(reducedMotion=it)) }
        ToggleRow("Flow background","Subtle strokes behind the welcome screen",look.backdrop) { change(look.copy(backdrop=it)) }
        Text("Colours apply to the orb and activity glow. Animation pauses when Ally is in the background.",color=Muted,fontSize=12.sp,lineHeight=20.sp)
        OutlinedButton({change(PhoneLook())},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(8.dp)) { Text("Reset appearance") }
    }
}
