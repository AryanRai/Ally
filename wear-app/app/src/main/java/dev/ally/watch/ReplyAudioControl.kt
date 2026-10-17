package dev.ally.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Quiet visual weight with a full-size touch target on the small round display. */
@Composable
internal fun ReplyAudioControl(playing: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Box(Modifier.heightIn(min = 48.dp).widthIn(min = 112.dp, max = 148.dp)
        .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
        .semantics { contentDescription = if (playing) "Stop reading aloud" else "Read the full reply aloud" },
        contentAlignment = Alignment.Center) {
        Row(Modifier.heightIn(min = 32.dp).background(Panel, RoundedCornerShape(16.dp))
            .border(1.dp, Hairline, RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (playing) "■" else "▶", color = Muted, fontSize = 10.sp)
            Text(if (playing) "Stop audio" else "Read aloud", color = if (enabled) White else Muted, fontSize = 11.sp)
        }
    }
}
