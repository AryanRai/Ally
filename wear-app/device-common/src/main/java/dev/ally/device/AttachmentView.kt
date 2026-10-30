package dev.ally.device

import android.content.Intent
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.compose.ui.draw.clipToBounds
import coil.ImageLoader
import okhttp3.OkHttpClient
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AttachmentView(assets: List<DeviceAttachment>, compact: Boolean = false) {
    if (assets.isEmpty()) return
    var expanded by androidx.compose.runtime.saveable.rememberSaveable(assets.map { it.id }) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        BasicText("${if(expanded) "⌄" else "›"} Images / attachments · ${assets.size}", style=TextStyle(color=Color(0xffa5d6ff),fontSize=if(compact) 11.sp else 13.sp),modifier=Modifier.fillMaxWidth().clickable { expanded=!expanded }.padding(vertical=10.dp))
        if(expanded) ExpandedAttachmentView(assets,compact)
    }
}

@Composable
private fun ExpandedAttachmentView(assets: List<DeviceAttachment>, compact: Boolean = false) {
    if (assets.isEmpty()) return
    var opened by remember { mutableStateOf<DeviceAttachment?>(null) }
    val context = LocalContext.current
    val loader = remember(context) { ImageLoader.Builder(context).okHttpClient { OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build() }.build() }
    DisposableEffect(loader) { onDispose { loader.shutdown() } }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        assets.forEach { asset ->
            Column(Modifier.fillMaxWidth().background(Color(0xff17191d), RoundedCornerShape(8.dp))
                .border(1.dp, Color(0xff303237), RoundedCornerShape(8.dp)).clickable { opened = asset }.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (asset.mimeType.startsWith("image/")) AsyncImage(
                    ImageRequest.Builder(context).data(attachmentUrl(context, asset)).addHeader("Authorization", "Bearer ${attachmentToken(context)}").size(if (compact) 480 else 1000).build(),
                    imageLoader = loader, contentDescription = asset.name, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp, max = if (compact) 110.dp else 230.dp))
                BasicText(asset.name, style = TextStyle(color = Color(0xffa5d6ff), fontSize = if (compact) 11.sp else 13.sp))
                BasicText("${asset.mimeType.substringAfter('/').uppercase()} · ${if (asset.size < 1024 * 1024) "${(asset.size + 1023) / 1024} KB" else "%.1f MB".format(asset.size / 1048576.0)} · Tap to open",
                    style = TextStyle(color = Color(0xffa3a4a8), fontSize = if (compact) 9.sp else 11.sp))
            }
        }
    }
    opened?.let { asset ->
        Dialog(onDismissRequest = { opened = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            val scope = rememberCoroutineScope()
            var scale by remember(asset.id) { mutableFloatStateOf(1f) }
            var offset by remember(asset.id) { mutableStateOf(Offset.Zero) }
            var status by remember(asset.id) { mutableStateOf("") }
            var loading by remember(asset.id) { mutableStateOf(false) }
            fun open(share: Boolean) { if (loading) return; loading = true; scope.launch {
                try {
                    val file = withContext(Dispatchers.IO) { downloadAttachment(context, asset) }
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.attachments", file)
                    val intent = if (share) Intent(Intent.ACTION_SEND).setType(asset.mimeType).putExtra(Intent.EXTRA_STREAM, uri)
                        else Intent(Intent.ACTION_VIEW).setDataAndType(uri, asset.mimeType)
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    context.startActivity(if (share) Intent.createChooser(intent, "Share attachment") else intent)
                } catch (e: CancellationException) { throw e }
                catch (_: Exception) { status = "Couldn’t open this file. Check the connection and a compatible file viewer." }
                finally { loading = false }
            } }
            Column(Modifier.fillMaxSize().background(Color(0xff08090b)).padding(horizontal = if (compact) 25.dp else 16.dp, vertical = if (compact) 18.dp else 32.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                BasicText(asset.name, style = TextStyle(color = Color.White, fontSize = if (compact) 10.sp else 17.sp), maxLines = if (compact) 1 else 2)
                if (asset.mimeType.startsWith("image/")) {
                    Box(Modifier.weight(1f).fillMaxWidth().clipToBounds().background(Color.Black).transformable(rememberTransformableState { zoom, pan, _ ->
                        scale = (scale * zoom).coerceIn(1f, 5f); offset = if (scale == 1f) Offset.Zero else offset + pan
                    }), contentAlignment = Alignment.Center) {
                        AsyncImage(ImageRequest.Builder(context).data(attachmentUrl(context, asset)).addHeader("Authorization", "Bearer ${attachmentToken(context)}").size(if (compact) 1200 else 2000).build(),
                            imageLoader = loader, contentDescription = asset.name, contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize().graphicsLayer(scaleX = scale, scaleY = scale, translationX = offset.x, translationY = offset.y))
                    }
                    if (compact) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        MediaButton("−") { scale = (scale / 1.5f).coerceAtLeast(1f); if (scale == 1f) offset = Offset.Zero }
                        MediaButton("+") { scale = (scale * 1.5f).coerceAtMost(5f) }
                        MediaButton("Close") { opened = null }
                    }
                } else {
                    BasicText(asset.mimeType, style = TextStyle(color = Color.LightGray, fontSize = 12.sp))
                    MediaButton(if (loading) "Opening…" else "Open file", !loading) { open(false) }
                }
                if (!compact) MediaButton(if (loading) "Loading…" else "Share / save a copy", !loading) { open(true) }
                if (status.isNotBlank()) BasicText(status, style = TextStyle(color = Color(0xffffb347), fontSize = 11.sp))
                if (!compact || !asset.mimeType.startsWith("image/")) MediaButton("Close") { opened = null }
            }
        }
    }
}

@Composable
private fun MediaButton(text: String, enabled: Boolean = true, click: () -> Unit) {
    Box(Modifier.heightIn(min = 40.dp).background(Color(0xff24262b), RoundedCornerShape(20.dp)).clickable(enabled = enabled, onClick = click).padding(horizontal = 14.dp, vertical = 8.dp)
        .semantics { contentDescription = text }, contentAlignment = Alignment.Center) {
        BasicText(text, style = TextStyle(color = Color.White, fontSize = 12.sp))
    }
}
