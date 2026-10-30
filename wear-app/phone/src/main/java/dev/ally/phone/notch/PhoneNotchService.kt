package dev.ally.phone.notch

import android.app.*
import android.content.*
import android.graphics.*
import android.os.*
import android.view.*
import dev.ally.device.DeviceLink
import dev.ally.phone.*
import kotlinx.coroutines.*
import androidx.compose.ui.graphics.toArgb

/** User-started, visible optional overlay. No boot receiver or automatic permission changes. */
class PhoneNotchService:Service() {
    companion object { internal var instance:PhoneNotchService?=null;private set }
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private var overlay:CompactNotch?=null
    private var row:CompactNotch?=null
    private var rowGeometry:NotchBounds?=null
    private var selectedStatus:String?=null
    private var owner:WindowManager?=null
    private var ownerType=0
    private var geometry:NotchBounds?=null
    private var statusUntil=0L
    private var ringMode=true
    private val preferences by lazy { DeviceLink.prefs(this) }
    override fun onBind(intent:Intent?)=null
    override fun onCreate() {
        super.onCreate()
        instance=this
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-phone-notch","Ally phone notch",NotificationManager.IMPORTANCE_LOW).apply{setSound(null,null);enableVibration(false)})
        val open=PendingIntent.getActivity(this,91,Intent(this,PhoneNotchSettingsActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop=PendingIntent.getService(this,92,Intent(this,PhoneNotchService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE)
        startForeground(91,Notification.Builder(this,"ally-phone-notch").setSmallIcon(dev.ally.phone.R.drawable.ic_ally).setContentTitle("Ally notch is on").setContentText("Tap to configure · Stop hides the notch").setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop",stop).build()).build())
        val filter=IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        registerReceiver(battery,filter,Context.RECEIVER_NOT_EXPORTED)
        scope.launch {
            val model=(application as AllyPhoneApplication).model
            while(isActive) {
                if(!PhoneNotch.enabled(this@PhoneNotchService)){stopSelf();break}
                PhoneNotch.state.value=PhoneNotch.project(this@PhoneNotchService,model.state.value)
                render()
                delay(500)
            }
        }
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action=="stop"){PhoneNotch.enable(this,false);stopSelf();return START_NOT_STICKY}
        if(!PhoneNotch.enabled(this) || !PhoneNotch.permission(this)){stopSelf();return START_NOT_STICKY}
        return START_STICKY
    }
    private val battery=object:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){
        if(!preferences.getBoolean("notch.charging",false)){PhoneNotch.remove("battery");return}
        val plugged=i.getIntExtra(BatteryManager.EXTRA_PLUGGED,0)>0
        val level=i.getIntExtra(BatteryManager.EXTRA_LEVEL,-1);val scale=i.getIntExtra(BatteryManager.EXTRA_SCALE,100)
        if(plugged && level>=0 && scale>0) PhoneNotch.event(NotchItem("battery","Charging · ${level*100/scale}%",kind="charging",priority=10)) else PhoneNotch.remove("battery")
    }}
    private fun render() {
        val state=PhoneNotch.state.value
        val show=NotchPolicy.show(PhoneNotch.enabled(this),PhoneNotch.permission(this),getSystemService(KeyguardManager::class.java).isDeviceLocked,getSystemService(PowerManager::class.java).isInteractive,PhoneNotch.expanded || dev.ally.device.AssistantVisibility.visible || PhoneNotch.captureHidden || AllyControlService.instance?.protectedSurface==true,System.currentTimeMillis(),PhoneNotch.snoozeUntil,state)
        if(!show){remove();return}
        val accessibility=AllyControlService.instance
        val wm=(accessibility ?: this).getSystemService(WindowManager::class.java)
        val type=if(accessibility!=null)WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY else WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        if(ownerType!=type || owner!==wm){remove();owner=wm;ownerType=type}
        val metrics=wm.currentWindowMetrics;val insets=metrics.windowInsets;val bounds=metrics.bounds;val bars=insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars());val cutout=insets.displayCutout
        val cuts=cutout?.boundingRects.orEmpty().map{NotchCutout(it.left,it.top,it.right,it.bottom)}
        val density=resources.displayMetrics.density
        ringMode=NotchPolicy.cameraMode(preferences.getString("notch.layout","camera"),System.currentTimeMillis(),0)
        val scale=preferences.getFloat("notch.scale",1f)
        val place=if(ringMode) NotchGeometry.camera(bounds.width(),bounds.height(),density,bars.top,cuts,preferences.getFloat("notch.offsetX",0f),preferences.getFloat("notch.offsetY",0f))
            else NotchGeometry.status(bounds.width(),bounds.height(),density,bars.left,bars.right,bars.top,cuts,scale)
        val params=WindowManager.LayoutParams(place.width,place.height,type,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_SECURE,PixelFormat.TRANSLUCENT).apply {
            gravity=Gravity.TOP or Gravity.LEFT; x=place.x;y=place.y;layoutInDisplayCutoutMode=WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;setFitInsetsTypes(0)
        }
        if(overlay==null){
            val view=CompactNotch(this)
            view.setOnClickListener{statusUntil=0;PhoneNotch.open(this)}
            view.setOnLongClickListener{startActivity(Intent(this,PhoneNotchSettingsActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));true}
            if(runCatching{wm.addView(view,params)}.isSuccess)overlay=view
        }else if(geometry!=place)runCatching{wm.updateViewLayout(overlay,params)}
        geometry=place
        val rows=NotchPolicy.liveRows(state)
        val selected=NotchPolicy.selected(rows,selectedStatus)
        selectedStatus=selected?.key
        if(ringMode && preferences.getBoolean("notch.liveStatus",true) && (selected!=null || System.currentTimeMillis()<statusUntil)) {
            val rowPlace=NotchGeometry.statusRow(bounds.width(),bounds.height(),density,bars.left,bars.right,bars.top,cuts,scale)
            val rowParams=WindowManager.LayoutParams().apply{copyFrom(params);width=rowPlace.width;height=rowPlace.height;x=rowPlace.x;y=rowPlace.y}
            if(row==null){
                val next=CompactNotch(this,true)
                next.setOnClickListener{selectedStatus=NotchPolicy.next(NotchPolicy.liveRows(PhoneNotch.state.value),selectedStatus);render()}
                next.setOnLongClickListener{PhoneNotch.open(this);true}
                if(runCatching{wm.addView(next,rowParams)}.isSuccess)row=next
            }else if(rowGeometry!=rowPlace)runCatching{wm.updateViewLayout(row,rowParams)}
            rowGeometry=rowPlace
            val item=selected ?: state.lead
            val index=rows.indexOfFirst{it.key==item?.key}+1
            val label=listOf(item?.title.orEmpty(),item?.detail.orEmpty()).filter{it.isNotBlank()}.joinToString(" · ")
            row?.bind(state.copy(lead=item?.copy(title=label),active=0,unread=0,attention=0),false,0f,0f,if(rows.size>1)"$index/${rows.size}" else "")
        }else removeRow()
        val camera=cuts.filter{it.top<=0 && it.bottom in 1 until bounds.height()/4}.maxByOrNull{it.right-it.left}
        val centerX=(camera?.let{(it.left+it.right)/2f} ?: (place.x+place.width/2f))+preferences.getFloat("notch.offsetX",0f)*density-place.x
        val centerY=(camera?.let{(it.top+it.bottom)/2f} ?: (place.y+place.height/2f))+preferences.getFloat("notch.offsetY",0f)*density-place.y
        overlay?.bind(state,ringMode,centerX,centerY)
    }
    internal fun visibilityChanged(){render()}
    internal fun preview(){statusUntil=System.currentTimeMillis()+8_000;render()}
    private fun removeRow(){row?.let{runCatching{owner?.removeView(it)}};row=null;rowGeometry=null}
    private fun remove(){removeRow();overlay?.let{runCatching{owner?.removeView(it)}};overlay=null;owner=null;ownerType=0;geometry=null}
    override fun onDestroy(){scope.cancel();remove();instance=null;runCatching{unregisterReceiver(battery)};PhoneNotch.expanded=false;super.onDestroy()}
    private class CompactNotch(c:Context,private val statusRow:Boolean=false):View(c) {
        private val p=Paint(Paint.ANTI_ALIAS_FLAG)
        private var state=NotchState(null,0,0,0,false)
        private var downX=0f;private var downY=0f
        private var ring=true
        private var centerX=0f;private var centerY=0f
        private var position=""
        private val bodyFont=resources.getFont(dev.ally.phone.R.font.geist_regular)
        init { setLayerType(LAYER_TYPE_SOFTWARE,null) }
        init{isClickable=true;isFocusable=true;contentDescription="Ally phone notch. Tap to expand, swipe to hide briefly, hold for settings"}
        fun bind(next:NotchState,camera:Boolean,cx:Float,cy:Float,counter:String=""){position=counter;state=next;ring=camera;centerX=cx;centerY=cy;contentDescription="Ally: ${next.lead?.title}. " + if(statusRow) "Status $position. Tap to cycle; right arrow or hold to preview in floating Ally" else "Tap to open floating Ally";invalidate()}
        override fun onDraw(canvas:Canvas){
            val d=resources.displayMetrics.density;val look=PhoneLook.load(DeviceLink.prefs(context))
            if(ring){
                val radius=(12*d*DeviceLink.prefs(context).getFloat("notch.scale",1f).coerceIn(.8f,1.3f)).coerceAtMost(width/2f-4*d)
                val cx=centerX.coerceIn(radius+3*d,width-radius-3*d)
                val cy=centerY.coerceIn(radius+3*d,height-radius-3*d)
                val power=context.getSystemService(PowerManager::class.java)
                val animate=NotchPolicy.haloAnimation(look.reducedMotion,power.isPowerSaveMode,android.animation.ValueAnimator.areAnimatorsEnabled(),state.active>0 || state.lead?.kind in setOf("voice","speech","control"))
                val colors=look.palette.colors.map{it.toArgb()}.let{(it+it.first()).toIntArray()}
                val shader=SweepGradient(cx,cy,colors,null)
                if(animate)shader.setLocalMatrix(Matrix().apply{setRotate((SystemClock.uptimeMillis()%6000)/6000f*360,cx,cy)})
                p.style=Paint.Style.STROKE;p.shader=shader
                if(look.glow!=GlowLevel.OFF){
                    p.strokeWidth=3*d;p.alpha=(110*look.glow.strength).toInt().coerceAtMost(200)
                    p.maskFilter=BlurMaskFilter((2.5f*d*look.glow.strength).coerceAtMost(4*d),BlurMaskFilter.Blur.NORMAL)
                    canvas.drawCircle(cx,cy,radius,p)
                }
                p.maskFilter=null;p.alpha=240;p.strokeWidth=1.5f*d
                canvas.drawCircle(cx,cy,radius,p)
                p.shader=null;p.alpha=255
                if(state.attention>0){p.style=Paint.Style.FILL;p.color=Color.rgb(255,173,133);canvas.drawCircle(cx+radius*.72f,cy+radius*.72f,2.5f*d,p)}
                if(animate)postInvalidateDelayed(50)
                return
            }
            p.style=Paint.Style.FILL;p.color=Color.rgb(12,12,13);canvas.drawRoundRect(0f,0f,width.toFloat(),height.toFloat(),24*d,24*d,p)
            val dotX=17*d;val dotY=height/2f
            val palette=look.palette.colors.map{it.toArgb()}
            if(look.glow!=GlowLevel.OFF){
                p.shader=RadialGradient(dotX,dotY,11*d,palette[1],Color.TRANSPARENT,Shader.TileMode.CLAMP)
                p.alpha=(150*look.glow.strength).toInt().coerceAtMost(235)
                canvas.drawCircle(dotX,dotY,11*d,p)
            }
            p.alpha=255;p.shader=SweepGradient(dotX,dotY,(palette+palette.first()).toIntArray(),null)
            canvas.drawCircle(dotX,dotY,4*d,p)
            p.shader=null
            p.color=Color.rgb(244,244,245);p.textSize=12*d;p.typeface=bodyFont
            val counts=if(state.attention>0)" · ${state.attention} need you" else if(state.active>1)" · ${state.active} active" else if(state.unread>0)" · ${state.unread} unread" else ""
            val text=(state.lead?.title ?: "Ally")+counts
            val reserved=if(statusRow)64*d else 0f
            val available=(width-43*d-reserved).coerceAtLeast(1f);val n=p.breakText(text,true,available,null)
            canvas.drawText(if(n<text.length)text.take((n-1).coerceAtLeast(0))+"…" else text,30*d,height/2f-(p.ascent()+p.descent())/2,p)
            if(statusRow){p.textSize=10*d;p.color=Color.rgb(153,153,158);canvas.drawText(position,width-63*d,height/2f-(p.ascent()+p.descent())/2,p);p.textSize=20*d;canvas.drawText("›",width-25*d,height/2f-(p.ascent()+p.descent())/2,p)}
        }
        override fun onTouchEvent(event:MotionEvent):Boolean{
            if(event.actionMasked==MotionEvent.ACTION_DOWN){downX=event.x;downY=event.y}
            if(event.actionMasked==MotionEvent.ACTION_UP && (kotlin.math.abs(event.x-downX)>48*resources.displayMetrics.density || downY-event.y>24*resources.displayMetrics.density)) {
                PhoneNotch.snoozeUntil=System.currentTimeMillis()+30_000;cancelLongPress();isPressed=false;PhoneNotchService.instance?.apply{statusUntil=0;render()};return true
            }
            if(statusRow && event.actionMasked==MotionEvent.ACTION_UP && event.x>=width-44*resources.displayMetrics.density){cancelLongPress();isPressed=false;PhoneNotch.open(context);return true}
            return super.onTouchEvent(event)
        }
    }
}
