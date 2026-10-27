package dev.ally.watch
internal typealias ReplySpan = dev.ally.device.ReplySpan
internal typealias ReplyBlock = dev.ally.device.ReplyBlock
internal object RichReplyContent {
    fun parse(text: String) = dev.ally.device.RichReplyContent.parse(text)
    fun webUrl(value: String) = dev.ally.device.RichReplyContent.webUrl(value)
}
