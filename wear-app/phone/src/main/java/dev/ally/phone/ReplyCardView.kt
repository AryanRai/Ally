package dev.ally.phone

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.ally.device.ReplyCard
import kotlinx.coroutines.delay

@Composable
internal fun ReplyCardView(card: ReplyCard, enabled: Boolean, send: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().border(1.dp, Line, RoundedCornerShape(10.dp)).background(Panel, RoundedCornerShape(10.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (card.title.isNotBlank()) MessageBody("**${card.title}**")
        if (card.body.isNotBlank()) MessageBody(card.body)
        when (card.type) {
            "checklist" -> card.items.forEach { item ->
                var checked by rememberSaveable(item) { mutableStateOf(false) }
                Row(Modifier.fillMaxWidth().clickable { checked = !checked }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(if (checked) "✓" else "○", color = Warm)
                    Box(Modifier.weight(1f)) { MessageBody(item) }
                }
            }
            "actions" -> card.actions.forEach { action -> OutlinedButton({ send(action.prompt) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(action.label) } }
            "progress" -> {
                LinearProgressIndicator(progress = { card.progress }, modifier = Modifier.fillMaxWidth(), color = Warm)
                Text("${(card.progress * 100).toInt()}%", color = Muted)
            }
            "timer" -> {
                var end by rememberSaveable { mutableLongStateOf(0L) }
                var remaining by rememberSaveable { mutableIntStateOf(card.seconds) }
                LaunchedEffect(end) {
                    if (end > 0) while (true) {
                        remaining = ((end - System.currentTimeMillis() + 999) / 1000).toInt().coerceAtLeast(0)
                        if (remaining == 0) { end = 0; break }
                        delay(250)
                    }
                }
                Text("%02d:%02d".format(remaining / 60, remaining % 60))
                OutlinedButton({ if (end > 0) { end = 0; remaining = card.seconds } else { remaining = card.seconds; end = System.currentTimeMillis() + card.seconds * 1000L } }) { Text(if (end > 0) "Reset" else "Start") }
                Text("Countdown runs while this card is open", color = Muted)
            }
        }
    }
}
