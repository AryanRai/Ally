package dev.ally.phone

import dev.ally.device.AssistantActivityState
import dev.ally.device.AssistantAgent

internal data class WidgetPresentation(val headline:String,val detail:String,val rows:List<AssistantAgent>) {
    companion object {
        fun from(state:AssistantActivityState):WidgetPresentation {
            val chats=state.chats.distinctBy{it.key}
            val ordered=chats.sortedBy { when { it.status=="needs_input"->0;it.status=="running"->1;it.unread->2;it.status=="error"->3;else->4 } }.take(2)
            val active=chats.count{it.active}
            val waiting=chats.count{it.status=="needs_input"}
            val unread=chats.count{it.unread}
            val title=when {state.stale->"Status unavailable";!state.checked->"Ready when you are";active>0->"$active active agent${if(active==1) "" else "s"}";else->"All quiet"}
            val detail=when {state.stale->"Saved activity · tap refresh";!state.checked->"Tap refresh to check your agents";waiting>0->"$waiting need${if(waiting==1) "s" else ""} your input";unread>0->"$unread unread repl${if(unread==1) "y" else "ies"}";active>0->"Working across your conversations";else->"Talk, check in, or start something"}
            return WidgetPresentation(title,detail,ordered)
        }
    }
}
