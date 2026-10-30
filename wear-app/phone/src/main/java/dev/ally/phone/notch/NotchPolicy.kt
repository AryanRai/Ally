package dev.ally.phone.notch

data class NotchItem(val key: String, val title: String, val detail: String = "", val kind: String = "status", val expiresAt: Long = Long.MAX_VALUE, val priority: Int = 0, val chatId: String? = null)
data class NotchState(val lead: NotchItem?, val active: Int, val unread: Int, val attention: Int, val connected: Boolean, val items: List<NotchItem> = emptyList()) {
    val fingerprint get() = lead?.let { "${it.kind}:${it.key}:${it.title}:${it.detail}" }.orEmpty()
}
object NotchPolicy {
    fun haloAnimation(reducedMotion: Boolean, powerSave: Boolean, animationsEnabled: Boolean, working: Boolean) = !reducedMotion && !powerSave && animationsEnabled && working
    fun cameraMode(layout: String?, now: Long, statusUntil: Long) = layout != "pill" && now >= statusUntil
    fun project(items: List<NotchItem>, active: Int, unread: Int, attention: Int, connected: Boolean, now: Long): NotchState {
        val live=items.filter { it.key.isNotBlank() && it.expiresAt > now }.distinctBy { it.key }.sortedByDescending { it.priority }
        return NotchState(live.firstOrNull(),active,unread,attention,connected,live)
    }
    fun liveRows(state:NotchState) = state.items.filterNot { it.key.startsWith("selected:") }
    fun selected(rows:List<NotchItem>,key:String?) = rows.firstOrNull{it.key==key} ?: rows.firstOrNull()
    fun next(rows:List<NotchItem>,key:String?):String? = if(rows.isEmpty()) null else rows[(rows.indexOfFirst{it.key==key}+1).mod(rows.size)].key
    fun show(enabled: Boolean, overlayReady: Boolean, locked: Boolean, screenOn: Boolean, expanded: Boolean, now: Long, snoozeUntil: Long, state: NotchState) =
        enabled && overlayReady && !locked && screenOn && !expanded && (now >= snoozeUntil || state.attention > 0)
    /** No contents/actions of security, authentication, hidden or own notifications are projected. */
    fun notificationAllowed(own: Boolean, allowed: Boolean, secret: Boolean, category: String?, title: String) =
        !own && allowed && !secret && category !in setOf("call", "service", "sys", "transport") &&
            !Regex("(?i)verification|one.time|security code|password|sign.in|authenticate|permission").containsMatchIn(title)
    fun countdown(showChronometer: Boolean, countDown: Boolean, deadline: Long, now: Long): Long? =
        deadline.takeIf { showChronometer && countDown && it > now && it-now <= 24*60*60*1000L }
}

data class NotchBounds(val x: Int, val y: Int, val width: Int, val height: Int)
data class NotchCutout(val left: Int, val top: Int, val right: Int, val bottom: Int)
/** Integer physical pixels; a side/landscape cutout cannot anchor a top pill off-screen. */
object NotchGeometry {
    /** A transparent 44dp touch target around the camera; the drawn ring is much smaller. */
    fun camera(width: Int, height: Int, density: Float, safeTop: Int, cutouts: List<NotchCutout>, offsetX: Float = 0f, offsetY: Float = 0f): NotchBounds {
        require(width > 0 && height > 0 && density.isFinite() && density > 0)
        val cut = cutouts.filter { it.top <= 0 && it.bottom in 1 until height / 4 }.maxByOrNull { it.right - it.left }
        val size = (44 * density).toInt().coerceIn(1, minOf(width, height))
        val cx = (cut?.let { (it.left + it.right) / 2f } ?: (width / 2f)) + offsetX.coerceIn(-32f,32f)*density
        val cy = (cut?.let { (it.top + it.bottom) / 2f } ?: maxOf(safeTop / 2f, size / 2f)) + offsetY.coerceIn(-32f,32f)*density
        return NotchBounds((cx-size/2).toInt().coerceIn(0,width-size), (cy-size/2).toInt().coerceIn(0,height-size),size,size)
    }
    /** Status is a separate, deliberately opened row below the camera, never a camera-height slab. */
    fun status(width: Int, height: Int, density: Float, safeLeft: Int, safeRight: Int, safeTop: Int, cutouts: List<NotchCutout>, scale: Float): NotchBounds {
        val base = place(width,height,density,safeLeft,safeRight,safeTop,cutouts)
        val left=safeLeft.coerceIn(0,width-1)
        val right=(width-safeRight.coerceAtLeast(0)).coerceIn(left+1,width)
        val w=(220*density*scale.coerceIn(.8f,1.3f)).toInt().coerceIn(1,right-left)
        val h=(48*density).toInt().coerceIn(1,height)
        val top=maxOf(safeTop,cutouts.filter{it.top<=0 && it.bottom in 1 until height/4}.maxOfOrNull{it.bottom} ?: 0)
        return NotchBounds((base.x+base.width/2-w/2).coerceIn(left,right-w),(top+4*density).toInt().coerceIn(0,height-h),w,h)
    }
    fun statusRow(width:Int,height:Int,density:Float,safeLeft:Int,safeRight:Int,safeTop:Int,cutouts:List<NotchCutout>,scale:Float):NotchBounds {
        val base=status(width,height,density,safeLeft,safeRight,safeTop,cutouts,scale)
        return base.copy(height=(36*density).toInt().coerceIn(1,height-base.y))
    }
    fun place(width: Int, height: Int, density: Float, safeLeft: Int, safeRight: Int, safeTop: Int, cutouts: List<NotchCutout>): NotchBounds {
        require(width > 0 && height > 0 && density.isFinite() && density > 0)
        val left = safeLeft.coerceIn(0, width - 1)
        val right = (width - safeRight.coerceAtLeast(0)).coerceIn(left + 1, width)
        val topCut = cutouts.filter { it.top <= 0 && it.bottom > 0 && it.bottom < height / 4 && it.left < right && it.right > left }.maxByOrNull { it.right - it.left }
        val w = (260 * density).toInt().coerceIn(1, right - left)
        val h = maxOf((48 * density).toInt(), (topCut?.bottom ?: 0) + if(topCut!=null)(32*density).toInt() else 0).coerceIn(1, height)
        val center = topCut?.let { (it.left.toLong() + it.right) / 2 }?.toInt() ?: (left + right) / 2
        val y = if (topCut != null) 0 else safeTop.coerceIn(0, (height - h).coerceAtLeast(0))
        return NotchBounds((center - w / 2).coerceIn(left, right - w), y, w, h)
    }
}
