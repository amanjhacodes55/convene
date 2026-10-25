package org.convene.app.call

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.WebView
import android.widget.Toast
import androidx.core.net.toUri
import java.io.File
import java.io.OutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Saves files the meeting page offers for download. Recordings are made in the page as `blob:` URLs,
 * which only the page itself can read, so for those we have the page stream the blob back to us in
 * base64 chunks (chunked so an hour-long recording doesn't have to fit in one string) and write it
 * into Downloads. Ordinary http(s) downloads go to [DownloadManager].
 */
@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
class BlobDownloader(private val activity: Activity, private val webView: WebView) {
    private var out: OutputStream? = null
    private var target: String? = null
    private var finish: ((Boolean) -> Unit)? = null

    init {
        webView.addJavascriptInterface(this, BRIDGE)
    }

    fun download(url: String, contentDisposition: String?, mimeType: String?) {
        when {
            url.startsWith("blob:") -> fetchBlob(url, mimeType)
            url.startsWith("http") -> enqueue(url, contentDisposition, mimeType)
            else -> toast("This file can't be downloaded on Android.")
        }
    }

    private fun enqueue(url: String, contentDisposition: String?, mimeType: String?) {
        val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
        val request = DownloadManager.Request(url.toUri())
            .setMimeType(mimeType)
            .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        activity.getSystemService(DownloadManager::class.java).enqueue(request)
        toast("Downloading $name")
    }

    private fun fetchBlob(url: String, mimeType: String?) {
        if (out != null) {
            toast("A download is already in progress.")
            return
        }
        val stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH.mm.ss"))
        val ext = if (mimeType?.contains("mp4") == true) "mp4" else "webm"
        val name = "Convene recording $stamp.$ext"
        if (!open(name, mimeType ?: "video/webm")) {
            toast("Couldn't save the recording.")
            return
        }
        toast("Saving recording…")
        // The page revokes the blob URL after a few seconds, so start reading it straight away.
        val js = """
            (async () => {
              const b = window.$BRIDGE;
              try {
                const blob = await (await fetch(${quote(url)})).blob();
                const size = 768 * 1024;
                for (let i = 0; i < blob.size; i += size) {
                  const bytes = new Uint8Array(await blob.slice(i, i + size).arrayBuffer());
                  let s = "";
                  for (let j = 0; j < bytes.length; j += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x8000));
                  b.chunk(btoa(s));
                }
                b.done(true);
              } catch (e) { b.done(false); }
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    /** Opens a stream into the public Downloads folder; via MediaStore where scoped storage requires it. */
    private fun open(name: String, mime: String): Boolean = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = activity.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
            out = resolver.openOutputStream(uri)
            finish = { ok ->
                // A failed copy shouldn't leave a broken half-file in Downloads.
                if (ok) resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
                else resolver.delete(uri, null, null)
            }
        } else {
            // Before Android 10 public Downloads needs a storage permission; the app's own folder doesn't.
            val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return false
            val file = File(dir, name)
            out = file.outputStream()
            finish = { ok -> if (!ok) file.delete() }
        }
        target = name
        out != null
    }.getOrDefault(false)

    @JavascriptInterface
    fun chunk(base64: String) {
        runCatching { out?.write(Base64.decode(base64, Base64.DEFAULT)) }
    }

    @JavascriptInterface
    fun done(ok: Boolean) {
        runCatching { out?.close() }
        runCatching { finish?.invoke(ok) }
        val name = target
        out = null
        finish = null
        target = null
        toast(if (ok) "Saved $name to Downloads" else "Couldn't save the recording.")
    }

    private fun toast(text: String) = activity.runOnUiThread {
        Toast.makeText(activity as Context, text, Toast.LENGTH_LONG).show()
    }

    private fun quote(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    private companion object {
        const val BRIDGE = "ConveneAndroid"
    }
}
