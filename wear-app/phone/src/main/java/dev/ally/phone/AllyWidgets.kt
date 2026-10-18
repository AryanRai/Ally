package dev.ally.phone

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.view.View
import android.widget.RemoteViews
import dev.ally.device.SurfaceActions
import dev.ally.device.SurfaceStatus
import kotlinx.coroutines.*

private const val REFRESH="dev.ally.phone.WIDGET_REFRESH"

/** One cached status widget and one small shortcut widget; no background voice or agent turns. */
open class AllyAgentWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context)
        if(javaClass==AllyAgentWidget::class.java) refresh(context)
    }
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) { render(context) }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context,intent)
        when(intent.action) {
            REFRESH -> refresh(context)
            "dev.ally.phone.SURFACE_CHANGED" -> render(context)
        }
    }
    private fun refresh(context: Context) {
        val receipt=goAsync()
        CoroutineScope(SupervisorJob()+Dispatchers.IO).launch {
            try { withTimeout(8000) { SurfaceStatus.refresh(context.applicationContext) }; render(context) }
            catch(_: Exception) { SurfaceStatus.failed(context); render(context) }
            finally { receipt.finish() }
        }
    }
    companion object {
        private fun action(context: Context, id: Int, action: String, chat: String? = null): PendingIntent = PendingIntent.getActivity(context,
            31*id+action.hashCode(),SurfaceActions.intent(context,action,chat),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        fun render(context: Context) {
            val manager=AppWidgetManager.getInstance(context)
            val snapshot=SurfaceStatus.load(context)
            for((component,layout) in listOf(AllyAgentWidget::class.java to R.layout.ally_agent_widget,AllyQuickWidget::class.java to R.layout.ally_quick_widget)) {
                for(id in manager.getAppWidgetIds(ComponentName(context,component))) {
                    val views=RemoteViews(context.packageName,layout)
                    views.setOnClickPendingIntent(R.id.widget_voice,action(context,id,"voice"))
                    views.setOnClickPendingIntent(R.id.widget_agents,action(context,id,"agents"))
                    if(layout==R.layout.ally_quick_widget) views.setOnClickPendingIntent(R.id.widget_inbox,action(context,id,"inbox"))
                    else {
                        views.setTextViewText(R.id.widget_status,snapshot.state.summary)
                        views.setTextViewText(R.id.widget_checked,snapshot.checkedLabel())
                        val lead=snapshot.lead
                        views.setTextViewText(R.id.widget_chat,lead?.let { "${it.title} · ${it.label}" } ?: "Open Ally or refresh to check agents")
                        views.setOnClickPendingIntent(R.id.widget_chat,if(lead==null) action(context,id,"agents") else action(context,id,"chat",lead.id))
                        val refresh=PendingIntent.getBroadcast(context,id,Intent(context,AllyAgentWidget::class.java).setAction(REFRESH),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                        views.setOnClickPendingIntent(R.id.widget_refresh,refresh)
                        val small=manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,140)<110
                        views.setViewVisibility(R.id.widget_chat,if(small) View.GONE else View.VISIBLE)
                    }
                    manager.updateAppWidget(id,views)
                }
            }
        }
    }
}
class AllyQuickWidget : AllyAgentWidget()

/** Optional Android Quick Settings entry; tap only opens the monitor. */
class AllyQuickTile : TileService() {
    override fun onStartListening() { super.onStartListening(); qsTile?.apply { label="Ally"; if(Build.VERSION.SDK_INT>=29) subtitle="Agent monitor"; state=Tile.STATE_ACTIVE; updateTile() } }
    override fun onClick() {
        super.onClick()
        unlockAndRun {
            val intent=SurfaceActions.intent(this,"agents")
            if(Build.VERSION.SDK_INT>=34) startActivityAndCollapse(PendingIntent.getActivity(this,700,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            else launchBeforeAndroid14(intent)
        }
    }
    // PendingIntent overload exists only on API 34+. This branch is restricted
    // to older Android versions, where the original platform call is supported.
    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
    @Suppress("DEPRECATION")
    private fun launchBeforeAndroid14(intent: Intent) { if(Build.VERSION.SDK_INT<34) startActivityAndCollapse(intent) }
}
