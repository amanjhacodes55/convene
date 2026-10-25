package org.convene.app.data

import android.content.Context
import androidx.core.content.edit

/**
 * Host keys for meetings started on this device. A guest-started meeting has no owner account, so
 * this key is the only proof of being its host; we keep it to rejoin as host later.
 */
class HostKeys(context: Context) {
    private val prefs = context.getSharedPreferences("host_keys", Context.MODE_PRIVATE)

    fun get(code: String): String? = prefs.getString(code, null)
    fun put(code: String, key: String) = prefs.edit { putString(code, key) }
}
