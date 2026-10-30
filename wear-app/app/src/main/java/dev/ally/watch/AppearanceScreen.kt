package dev.ally.watch

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button

@Composable
internal fun AppearanceScreen(look: WatchLook, change: (WatchLook) -> Unit, back: () -> Unit) {
    var picker by rememberSaveable { mutableStateOf("") }
    BackHandler { if (picker.isNotEmpty()) picker = "" else back() }
    // Each picker starts at the top; returning restores the main appearance scroll position.
    val mainScroll = rememberScrollState()
    val pickerScroll = key(picker) { rememberScrollState() }
    val scroll = if (picker.isEmpty()) mainScroll else pickerScroll
    Column(Modifier.fillMaxSize().background(Ink).bezelScroll(scroll).verticalScroll(scroll)
        .padding(horizontal = 27.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(when (picker) { "style" -> "Orb style"; "palette" -> "Colour theme"; "glow" -> "Activity glow"; else -> "Appearance" }, color = White, fontSize = 18.sp)
        if (picker.isEmpty()) {
            Box(Modifier.size(76.dp), contentAlignment = Alignment.Center) {
                PresenceGlow(true, look)
                WatchOrb(look, Phase.IDLE, 0f, Modifier.fillMaxSize())
            }
            Text("Live preview · saved on this watch", color = Muted, fontSize = 10.sp)
            Button(onClick = { picker = "style" }, modifier = Modifier.fillMaxWidth()) { Text("Orb · ${look.style.label}", fontSize = 12.sp) }
            Button(onClick = { picker = "palette" }, modifier = Modifier.fillMaxWidth()) { Text("Theme · ${look.palette.label}", fontSize = 12.sp) }
            Button(onClick = { picker = "glow" }, modifier = Modifier.fillMaxWidth()) { Text("Glow · ${look.glow.label}", fontSize = 12.sp) }
            LookToggle("Listening eyes", look.listeningEyes) { change(look.copy(listeningEyes = it)) }
            LookToggle("Reduced motion", look.reducedMotion) { change(look.copy(reducedMotion = it)) }
            LookToggle("Flow background", look.backdrop) { change(look.copy(backdrop = it)) }
            Text("Same appearance choices as phone. Colours apply to your orb, glow and controls; motion pauses when idle. Device appearance is saved separately.", color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center)
            Button(onClick = { change(WatchLook()) }, modifier = Modifier.fillMaxWidth()) { Text("Reset appearance", fontSize = 12.sp) }
        } else {
            Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                when (picker) {
                    "style" -> OrbStyle.entries.forEach { style ->
                        LookChoice(style.label, look.style == style, look.copy(style = style)) { change(look.copy(style = style)) }
                    }
                    "palette" -> OrbPalette.entries.forEach { palette ->
                        LookChoice(palette.label, look.palette == palette, look.copy(palette = palette)) { change(look.copy(palette = palette)) }
                    }
                    "glow" -> GlowLevel.entries.forEach { glow ->
                        LookChoice(glow.label, look.glow == glow, null) { change(look.copy(glow = glow)) }
                    }
                }
            }
        }
        Button(onClick = { if (picker.isNotEmpty()) picker = "" else back() }, modifier = Modifier.fillMaxWidth()) { Text("Back", fontSize = 12.sp) }
    }
}

@Composable
private fun LookChoice(label: String, selected: Boolean, preview: WatchLook?, choose: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel)
        .selectable(selected = selected, role = Role.RadioButton, onClick = choose)
        .heightIn(min = 48.dp).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (preview != null) WatchOrb(preview, Phase.IDLE, 0f, Modifier.size(34.dp))
        Text(label, color = White, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text(if (selected) "●" else "○", color = if (selected) androidx.wear.compose.material3.MaterialTheme.colorScheme.primary else Muted, fontSize = 15.sp)
    }
}

@Composable
private fun LookToggle(label: String, checked: Boolean, change: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel)
        .toggleable(value = checked, role = Role.Switch, onValueChange = change)
        .heightIn(min = 48.dp).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = White, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text(if (checked) "On" else "Off", color = if (checked) White else Muted, fontSize = 11.sp)
    }
}
