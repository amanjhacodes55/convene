package org.convene.app.call

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.graphics.toColorInt
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.convene.app.BuildConfig

/**
 * The call itself. The web app already does WebRTC, the lobby and every control, so rather than
 * re-implementing all of that natively we host it full screen and bridge what a WebView can't do on
 * its own: Android runtime permissions, the back button and file downloads.
 */
class CallActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var downloads: BlobDownloader

    /** A camera/mic request from the page that is waiting on the Android permission dialog. */
    private var pendingRequest: PermissionRequest? = null

    private val askPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        pendingRequest?.let(::answer)
        pendingRequest = null
        // The page loads after the first answer so the lobby's preview asks only once.
        if (webView.url == null) webView.loadUrl(intent.getStringExtra(EXTRA_URL) ?: BuildConfig.BASE_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        goImmersive()

        CookieManager.getInstance().setAcceptCookie(true)
        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor("#0B0D12".toColorInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            webViewClient = CallWebViewClient()
            webChromeClient = CallChromeClient()
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        downloads = BlobDownloader(this, webView)
        webView.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            downloads.download(url, contentDisposition, mimeType)
        }
        setContentView(webView)

        // Keep the page's controls clear of a notch or camera hole while the bars are hidden.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
            val cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            v.setPadding(cut.left, cut.top, cut.right, cut.bottom)
            insets
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = confirmLeave()
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        }
        if (webView.url == null) {
            val missing = MEDIA_PERMISSIONS.filterNot(::granted)
            if (missing.isEmpty()) webView.loadUrl(intent.getStringExtra(EXTRA_URL) ?: BuildConfig.BASE_URL)
            else askPermissions.launch(missing.toTypedArray())
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Dialogs and the permission prompt bring the bars back; hide them again once we have focus.
        if (hasFocus) goImmersive()
    }

    override fun onDestroy() {
        // Tear the page down so the camera and microphone are released and the server sees us leave.
        webView.loadUrl("about:blank")
        webView.destroy()
        super.onDestroy()
    }

    private fun goImmersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun confirmLeave() {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Leave the meeting?")
            .setMessage("You can rejoin with the same link while the meeting is running.")
            .setPositiveButton("Leave") { _, _ -> finish() }
            .setNegativeButton("Stay", null)
            .show()
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    /** Grants the page exactly the media resources whose Android permission the user allowed. */
    private fun answer(request: PermissionRequest) {
        val allowed = request.resources.filter { resource ->
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> granted(Manifest.permission.CAMERA)
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> granted(Manifest.permission.RECORD_AUDIO)
                else -> false
            }
        }
        if (allowed.isEmpty()) request.deny() else request.grant(allowed.toTypedArray())
    }

    private inner class CallChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            // Only our own server may use the camera and microphone.
            if (request.origin.host != BuildConfig.BASE_URL.toUri().host) {
                request.deny()
                return
            }
            runOnUiThread {
                val needed = request.resources.mapNotNull {
                    when (it) {
                        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
                        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                        else -> null
                    }
                }.filterNot(::granted)
                if (needed.isEmpty()) {
                    answer(request)
                } else {
                    pendingRequest?.deny()
                    pendingRequest = request
                    askPermissions.launch(needed.toTypedArray())
                }
            }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (pendingRequest == request) pendingRequest = null
        }
    }

    private inner class CallWebViewClient : WebViewClient() {
        /** Our own pages stay in the call; anything else (docs, GitHub, mailto:) opens outside it. */
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == BuildConfig.BASE_URL.toUri().host) {
                // Leaving the meeting lands on the web home page; the native app is the home here.
                if (url.path.isNullOrEmpty() || url.path == "/") {
                    finish()
                    return true
                }
                return false
            }
            try {
                startActivity(Intent(Intent.ACTION_VIEW, url))
            } catch (_: Exception) {
                Toast.makeText(this@CallActivity, "No app can open this link.", Toast.LENGTH_SHORT).show()
            }
            return true
        }
    }

    companion object {
        private const val EXTRA_URL = "url"
        private val MEDIA_PERMISSIONS = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)

        fun intent(context: Context, url: String): Intent =
            Intent(context, CallActivity::class.java).putExtra(EXTRA_URL, url)
    }
}
