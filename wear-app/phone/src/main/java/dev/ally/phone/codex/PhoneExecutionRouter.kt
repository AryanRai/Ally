package dev.ally.phone.codex

/** Conservative routing of explicit phone work; never decides permissions or falls back after send. */
internal object PhoneExecutionRouter {
    enum class Target { PHONE, PC, CHOOSE }
    fun target(text:String):Target {
        val phone=Regex("\\b(this|my|the) phone\\b|\\bon (android|my phone|this phone)\\b|\\bphone (screen|settings|app|widget|control)\\b",RegexOption.IGNORE_CASE).containsMatchIn(text)
        val pc=Regex("\\b(pc|desktop|laptop|computer|windows|repository|repo|codebase)\\b",RegexOption.IGNORE_CASE).containsMatchIn(text)
        return if(phone&&!pc)Target.PHONE else if(pc&&!phone)Target.PC else Target.CHOOSE
    }
}
