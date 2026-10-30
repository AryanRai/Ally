package dev.ally.phone

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.LinearGradient
import android.graphics.Shader
import android.graphics.RectF
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection

/** Render existing app art once per appearance, not a widget animation/service. */
internal object WidgetArt {
    private var cached:Pair<PhoneLook,Bitmap>?=null
    fun orb(look:PhoneLook):Bitmap {
        cached?.takeIf{it.first==look}?.let{return it.second}
        val bitmap=Bitmap.createBitmap(256,256,Bitmap.Config.ARGB_8888)
        CanvasDrawScope().draw(Density(2f),LayoutDirection.Ltr,androidx.compose.ui.graphics.Canvas(bitmap.asImageBitmap()),Size(256f,256f)) {
            drawPhoneOrb(look)
        }
        cached=look to bitmap
        return bitmap
    }
    fun button(look:PhoneLook):Bitmap {
        val bitmap=Bitmap.createBitmap(320,88,Bitmap.Config.ARGB_8888)
        val canvas=Canvas(bitmap);val p=Paint(Paint.ANTI_ALIAS_FLAG)
        p.shader=LinearGradient(0f,0f,320f,88f,look.palette.colors.map{it.copy(alpha=.16f).toArgb()}.toIntArray(),null,Shader.TileMode.CLAMP)
        canvas.drawRoundRect(RectF(2f,2f,318f,86f),24f,24f,p)
        p.style=Paint.Style.STROKE;p.strokeWidth=2f
        p.shader=LinearGradient(0f,0f,320f,88f,look.palette.colors.map{it.copy(alpha=.8f).toArgb()}.toIntArray(),null,Shader.TileMode.CLAMP)
        canvas.drawRoundRect(RectF(2f,2f,318f,86f),24f,24f,p)
        return bitmap
    }
}
