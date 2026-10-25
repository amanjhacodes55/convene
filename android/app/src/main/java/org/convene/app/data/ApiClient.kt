package org.convene.app.data

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A failed call, carrying the server's own `{error}` message so screens can show it as is. */
class ApiException(val status: Int, message: String) : IOException(message)

/**
 * A tiny JSON client for the Convene web API.
 *
 * The session cookie lives in [CookieManager], the WebView's own persistent cookie store, rather than
 * a separate jar: that way signing in natively also signs in the meeting WebView (which is how the
 * server recognises the owner as host) and there is never a second copy to keep in sync.
 */
class ApiClient(private val baseUrl: String) {
    private val cookies: CookieManager get() = CookieManager.getInstance()

    suspend fun get(path: String): JSONObject = request("GET", path, null)
    suspend fun post(path: String, body: JSONObject = JSONObject()): JSONObject = request("POST", path, body)
    suspend fun delete(path: String): JSONObject = request("DELETE", path, null)

    private suspend fun request(method: String, path: String, body: JSONObject?): JSONObject = withContext(Dispatchers.IO) {
        val url = baseUrl + path
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 20_000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
            cookies.getCookie(url)?.let { setRequestProperty("Cookie", it) }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            body?.let { conn.outputStream.use { out -> out.write(it.toString().toByteArray()) } }
            val status = conn.responseCode
            conn.headerFields["Set-Cookie"]?.forEach { cookies.setCookie(url, it) }
            cookies.flush()
            val text = (if (status >= 400) conn.errorStream else conn.inputStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = text.takeIf { it.isNotBlank() }?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
            if (status >= 400) {
                throw ApiException(status, json.optString("error").ifBlank { "Request failed ($status)." })
            }
            json
        } finally {
            conn.disconnect()
        }
    }

    /** Forgets the session locally even if the server could not be reached to sign out. */
    fun clearSession() {
        cookies.setCookie(baseUrl, "convene_session=; Max-Age=0; Path=/")
        cookies.flush()
    }
}
