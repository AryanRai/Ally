package dev.ally.watch

import androidx.wear.tiles.TileService
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders.*
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import com.google.common.util.concurrent.ListenableFuture
import androidx.concurrent.futures.CallbackToFutureAdapter
import dev.ally.device.SurfaceSnapshot
import dev.ally.device.SurfaceStatus
import kotlinx.coroutines.*

/** A user-added Wear OS tile. Refresh is read-only; actions launch the real app. */
class AllyAgentTile : TileService() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> = CallbackToFutureAdapter.getFuture { result ->
        scope.launch {
            try {
                val snapshot=withTimeout(8000) { SurfaceStatus.refresh(this@AllyAgentTile) }
                result.set(tile(snapshot))
            } catch(_: Exception) { SurfaceStatus.failed(this@AllyAgentTile); result.set(tile(SurfaceStatus.load(this@AllyAgentTile))) }
        }
        "Ally agent snapshot"
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        CallbackToFutureAdapter.getFuture { result -> result.set(ResourceBuilders.Resources.Builder().setVersion("1").build()); "Ally resources" }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    private fun launch(id: String, action: String, chat: String? = null): ModifiersBuilders.Modifiers {
        val activity=ActionBuilders.AndroidActivity.Builder().setPackageName(packageName).setClassName("$packageName.MainActivity")
            .addKeyToExtraMapping("allySurface",ActionBuilders.AndroidStringExtra.Builder().setValue(action).build())
        if(chat!=null) activity.addKeyToExtraMapping("allySurfaceChat",ActionBuilders.AndroidStringExtra.Builder().setValue(chat).build())
        return ModifiersBuilders.Modifiers.Builder().setClickable(ModifiersBuilders.Clickable.Builder().setId(id)
            .setOnClick(ActionBuilders.LaunchAction.Builder().setAndroidActivity(activity.build()).build()).build()).build()
    }
    private fun text(value: String, size: Float, color: Int = 0xfff4f4f5.toInt()): Text = Text.Builder().setText(value)
        .setFontStyle(FontStyle.Builder().setSize(sp(size)).setColor(argb(color)).build()).setMaxLines(1).setOverflow(TEXT_OVERFLOW_ELLIPSIZE_END).build()
    private fun tile(snapshot: SurfaceSnapshot): TileBuilders.Tile {
        val column=Column.Builder().setWidth(androidx.wear.protolayout.DimensionBuilders.expand()).setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)
            .addContent(text("ALLY",22f)).addContent(Spacer.Builder().setHeight(dp(4f)).build())
            .addContent(text(snapshot.state.summary,12f))
            .addContent(text(snapshot.checkedLabel(),9f,0xff99999e.toInt()))
        snapshot.lead?.let { lead ->
            column.addContent(Spacer.Builder().setHeight(dp(8f)).build())
            column.addContent(Box.Builder().setWidth(androidx.wear.protolayout.DimensionBuilders.expand()).setHeight(dp(38f))
                .setModifiers(launch("chat","chat",lead.id)).addContent(Column.Builder()
                    .addContent(text(lead.title,11f)).addContent(text("${if(snapshot.state.stale) "Last seen · " else ""}${lead.label} · ${lead.provider}",9f,0xffb5b5bb.toInt())).build()).build())
        }
        column.addContent(Spacer.Builder().setHeight(dp(8f)).build())
        val actions=Row.Builder().setWidth(androidx.wear.protolayout.DimensionBuilders.expand()).setVerticalAlignment(VERTICAL_ALIGN_CENTER)
        for((title,action) in listOf("Talk" to "voice","Agents" to "agents","Inbox" to "inbox")) {
            actions.addContent(Box.Builder().setWidth(androidx.wear.protolayout.DimensionBuilders.weight(1f)).setHeight(dp(40f))
                .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(launch(action,action).clickable!!)
                    .setBackground(ModifiersBuilders.Background.Builder().setColor(argb(0xff18181a.toInt())).setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(18f)).build()).build()).build())
                .addContent(text(title,11f)).build())
        }
        column.addContent(actions.build())
        val root=Box.Builder().setWidth(androidx.wear.protolayout.DimensionBuilders.expand()).setHeight(androidx.wear.protolayout.DimensionBuilders.expand())
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setBackground(ModifiersBuilders.Background.Builder().setColor(argb(0xff0c0c0d.toInt())).build())
                .setPadding(ModifiersBuilders.Padding.Builder().setAll(dp(24f)).build()).build()).addContent(column.build()).build()
        return TileBuilders.Tile.Builder().setResourcesVersion("1").setFreshnessIntervalMillis(60000)
            .setTileTimeline(TimelineBuilders.Timeline.Builder().addTimelineEntry(TimelineBuilders.TimelineEntry.Builder()
                .setLayout(Layout.Builder().setRoot(root).build()).build()).build()).build()
    }
}
