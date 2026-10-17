package dev.ally.watch

import android.content.Intent
import androidx.core.net.toUri
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text as WearText
import androidx.wear.remote.interactions.RemoteActivityHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

private val LinkBlue = Color(0xFF8ACBFF)

@Composable
internal fun RichReply(text: String, title: Boolean = false) {
    val blocks = remember(text) { RichReplyContent.parse(text) }
    var link by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        blocks.forEach { block ->
            if (block.kind == "divider") Box(Modifier.fillMaxWidth().height(1.dp).background(Hairline))
            else {
                val code = block.kind == "code"
                val annotation = remember(block) { buildAnnotatedString {
                    append(block.prefix)
                    block.spans.forEach { span ->
                        withStyle(SpanStyle(fontWeight = if (span.bold) FontWeight.Bold else null,
                            fontStyle = if (span.italic) FontStyle.Italic else null,
                            fontFamily = if (span.code) Mono else null,
                            background = if (span.code) Panel else Color.Unspecified)) {
                            if (span.url != null) withLink(LinkAnnotation.Url(span.url,
                                TextLinkStyles(SpanStyle(color = LinkBlue, textDecoration = TextDecoration.Underline)),
                                LinkInteractionListener { link = span.url })) { append(span.text) }
                            else append(span.text)
                        }
                    }
                } }
                val framed = block.kind in setOf("code", "quote", "table")
                Column(Modifier.fillMaxWidth().padding(start = if (block.kind == "text") (block.level.coerceAtMost(2) * 6).dp else 0.dp)
                    .then(if (framed) Modifier.background(Panel, RoundedCornerShape(6.dp)).border(1.dp, Hairline, RoundedCornerShape(6.dp)).padding(8.dp) else Modifier)) {
                    if (code && block.language.isNotBlank()) Text(block.language, fontFamily = Mono, color = Muted, fontSize = 9.sp, modifier = Modifier.padding(bottom = 5.dp))
                    WearText(annotation, color = White, fontSize = when { code -> 11.sp; block.kind == "heading" -> if (block.level <= 2) 17.sp else 15.sp; else -> 13.sp },
                        lineHeight = if (code) 16.sp else 19.sp,
                        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = if (code) Mono else Geist,
                            fontWeight = if (title || block.kind == "heading") FontWeight.Bold else FontWeight.Normal),
                        modifier = if (code) Modifier.horizontalScroll(rememberScrollState()) else Modifier.fillMaxWidth())
                }
            }
        }
    }
    link?.let { url -> WatchLink(url) { link = null } }
}

@Composable
private fun WatchLink(url: String, close: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var status by remember(url) { mutableStateOf("") }
    var opening by remember(url) { mutableStateOf(false) }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val scroll = rememberScrollState()
        Column(Modifier.fillMaxSize().background(Ink).bezelScroll(scroll).verticalScroll(scroll).padding(horizontal = 26.dp, vertical = 30.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Open link", fontFamily = Tanker, fontSize = 22.sp)
            Text(url.toUri().host ?: "Web page", color = LinkBlue, fontSize = 13.sp)
            Text(url, color = Muted, fontSize = 10.sp)
            Button(onClick = {
                opening = true; status = "Opening on your phone…"
                scope.launch {
                    status = try {
                        val intent = Intent(Intent.ACTION_VIEW, url.toUri()).addCategory(Intent.CATEGORY_BROWSABLE)
                        val result = RemoteActivityHelper(context).startRemoteActivity(intent)
                        withContext(Dispatchers.IO) { result.get(15, TimeUnit.SECONDS) }
                        "Opened on your phone"
                    } catch (e: CancellationException) { throw e }
                    catch (_: Exception) { "Couldn’t open on phone. Check the phone connection or try on watch." }
                    opening = false
                }
            }, enabled = !opening, modifier = Modifier.fillMaxWidth()) { Text("Open on phone", fontSize = 12.sp) }
            Button(onClick = {
                status = try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()).addCategory(Intent.CATEGORY_BROWSABLE))
                    "Opened on watch"
                } catch (_: Exception) { "No web browser on this watch. Use Open on phone." }
            }, enabled = !opening, modifier = Modifier.fillMaxWidth()) { Text("Open on watch", fontSize = 12.sp) }
            if (status.isNotBlank()) Text(status, color = Muted, fontSize = 11.sp)
            Button(onClick = close, modifier = Modifier.fillMaxWidth()) { Text("Back", fontSize = 12.sp) }
        }
    }
}
