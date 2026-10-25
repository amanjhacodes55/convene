package org.convene.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import org.convene.app.call.CallActivity
import org.convene.app.data.MeetingCodes
import org.convene.app.ui.ConveneNavHost
import org.convene.app.ui.theme.ConveneTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The app is always dark, so keep the status bar icons light whatever the system theme is.
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        // Only on a fresh launch: after rotation the call is already open (or was closed on purpose).
        if (savedInstanceState == null) openDeepLink(intent)
        setContent {
            ConveneTheme {
                ConveneNavHost()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openDeepLink(intent)
    }

    /** An invitation link (…/m/<code>) goes straight into the call; Home stays underneath for afterwards. */
    private fun openDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        val code = MeetingCodes.parse(data.toString()) ?: return
        val repo = (application as ConveneApplication).repository
        data.fragment?.split('&')?.firstOrNull { it.startsWith("host=") }?.removePrefix("host=")
            ?.takeIf { it.isNotBlank() }?.let { repo.rememberHostKey(code, Uri.decode(it)) }
        startActivity(CallActivity.intent(this, repo.meetingUrl(code)))
    }
}
