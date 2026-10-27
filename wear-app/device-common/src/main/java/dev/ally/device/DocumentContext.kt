package dev.ally.device

import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** Reads only the private copy of a file explicitly supplied through Android sharing/picker. */
internal object DocumentContext {
    fun describe(item:SharedFile,file:File):JSONObject {
        val digest=MessageDigest.getInstance("SHA-256")
        file.inputStream().use{input->val buffer=ByteArray(32768);while(true){val n=input.read(buffer);if(n<0)break;digest.update(buffer,0,n)}}
        val value=JSONObject().put("fileKey",item.key).put("name",item.name).put("mimeType",item.mimeType).put("bytes",item.size)
            .put("sha256",digest.digest().joinToString(""){"%02x".format(it.toInt() and 255)}).put("attachmentKind","original_file")
        val pdf=file.inputStream().use{val magic=ByteArray(5);it.read(magic)==5&&magic.contentEquals("%PDF-".toByteArray())}
        val count=if(pdf)runCatching{ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY).use{fd->PdfRenderer(fd).use{it.pageCount}}}.getOrNull()else null
        value.put("pageCount",if(count!=null)JSONObject().put("status","available").put("value",count).put("source","android_pdf_renderer")
            else JSONObject().put("status","unavailable").put("reason",if(pdf)"PDF is protected or unsupported by Android PDF renderer" else "Not a supported PDF document"))
        return value
    }
}
