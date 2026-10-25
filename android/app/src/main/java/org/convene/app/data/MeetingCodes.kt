package org.convene.app.data

object MeetingCodes {
    private val CODE = Regex("^[a-z]{3}-[a-z]{4}-[a-z]{3}$")
    private val IN_LINK = Regex("/m/([A-Za-z]{3}-[A-Za-z]{4}-[A-Za-z]{3})(?:[/?#]|$)")

    fun isCode(s: String) = CODE.matches(s)

    /**
     * Accepts what people actually paste: a bare code (any case, with stray spaces), a full
     * invitation link, or a code typed without dashes.
     */
    fun parse(input: String): String? {
        val text = input.trim()
        IN_LINK.find(text)?.let { return it.groupValues[1].lowercase() }
        val lower = text.lowercase().replace(" ", "")
        if (isCode(lower)) return lower
        val letters = lower.filter { it in 'a'..'z' }
        if (letters.length == 10 && letters.length == lower.length) {
            return "${letters.substring(0, 3)}-${letters.substring(3, 7)}-${letters.substring(7)}"
        }
        return null
    }
}
