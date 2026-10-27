package dev.ally.phone
import android.content.Context
import android.content.Intent
import android.net.Uri
import dev.ally.device.sharedUris as deviceSharedUris
typealias SharedFile = dev.ally.device.SharedFile
typealias ShareDraft = dev.ally.device.ShareDraft
typealias ShareDraftStore = dev.ally.device.ShareDraftStore
fun Intent.sharedUris() = this.deviceSharedUris()
fun shareSources(context: Context, uris: List<Uri>) = dev.ally.device.shareSources(context, uris)
