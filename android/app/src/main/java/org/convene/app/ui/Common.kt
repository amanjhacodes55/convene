package org.convene.app.ui

import android.content.Context
import android.content.Intent
import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.ViewModelProvider
import org.convene.app.ConveneApplication
import org.convene.app.call.CallActivity
import org.convene.app.data.ApiException
import org.convene.app.data.ConveneRepository
import org.convene.app.data.Meeting
import org.convene.app.data.MeetingStatus
import org.convene.app.ui.theme.Convene
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

val CreationExtras.repository: ConveneRepository
    get() = (this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ConveneApplication).repository

fun Context.repository(): ConveneRepository = (applicationContext as ConveneApplication).repository

fun Context.openCall(code: String) = startActivity(CallActivity.intent(this, repository().meetingUrl(code)))

/** Turns any failure into a sentence a person can act on. */
fun Throwable.friendly(): String = when (this) {
    // Gateway timeouts and crashes come back as HTML or empty bodies, not as a message worth showing.
    is ApiException -> if (status >= 500) "Convene's server isn't responding right now. Try again in a moment." else message ?: "Something went wrong."
    is IOException -> "Can't reach Convene. Check your connection and try again."
    else -> message ?: "Something went wrong."
}

private val zone: ZoneId get() = ZoneId.systemDefault()
fun Instant.dayLabel(): String = DateTimeFormatter.ofPattern("EEE, d MMM yyyy").withZone(zone).format(this)
fun Instant.timeLabel(): String = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withZone(zone).format(this)
fun Instant.month(): String = DateTimeFormatter.ofPattern("MMM").withZone(zone).format(this).uppercase()
fun Instant.dayOfMonth(): String = DateTimeFormatter.ofPattern("d").withZone(zone).format(this)

fun formatDuration(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return when {
        h > 0 -> "${h}h ${m}m"
        m > 0 -> "${m}m ${s}s"
        else -> "${s}s"
    }
}

/** The invitation people paste into chats and calendars, mirroring the web dashboard's "Copy invitation". */
fun Context.shareInvitation(meeting: Meeting, link: String) {
    val text = buildString {
        appendLine("You're invited to a Convene meeting.")
        appendLine()
        appendLine("Topic: ${meeting.topic}")
        meeting.startTime?.let { appendLine("Time: ${it.dayLabel()} ${it.timeLabel()} (${zone.id})") }
        meeting.durationMinutes?.let { appendLine("Duration: $it min") }
        appendLine()
        appendLine("Join: $link")
        appendLine()
        append("Meeting ID: ${meeting.id}")
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, meeting.topic)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    startActivity(Intent.createChooser(send, "Share invitation"))
}

@Composable
fun Glyph(@DrawableRes id: Int, contentDescription: String?, modifier: Modifier = Modifier, tint: Color = Color.Unspecified) {
    Icon(
        painter = painterResource(id),
        contentDescription = contentDescription,
        modifier = modifier.size(20.dp),
        tint = if (tint == Color.Unspecified) MaterialTheme.colorScheme.onSurface else tint,
    )
}

/** The web app's signature gradient button. */
@Composable
fun AccentButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    @DrawableRes icon: Int? = null,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = modifier
            .defaultMinSize(minHeight = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (enabled) Convene.Accent else androidx.compose.ui.graphics.SolidColor(Convene.PanelHigh)),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = Color.White,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = Color.White.copy(alpha = 0.7f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
    ) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
        } else if (icon != null) {
            Glyph(icon, null, tint = Color.White)
        }
        if (busy || icon != null) Spacer(Modifier.width(8.dp))
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun StatusBadge(meeting: Meeting) {
    val (label, color) = when {
        meeting.status == MeetingStatus.STARTED -> "Live" to Convene.Good
        meeting.status == MeetingStatus.ENDED -> "Ended" to Convene.Muted
        meeting.startTime != null -> "Scheduled" to Convene.AccentStart
        else -> "Not started" to Convene.Muted
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Box(Modifier.size(6.dp).clip(RoundedCornerShape(50)).background(color))
        Spacer(Modifier.width(5.dp))
        Text(label, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun ErrorText(message: String?, modifier: Modifier = Modifier) {
    if (message != null) {
        Text(
            message,
            color = Convene.Danger,
            style = MaterialTheme.typography.bodyMedium,
            modifier = modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(Convene.Danger.copy(alpha = 0.12f))
                .padding(12.dp),
        )
    }
}

@Composable
fun contextRepository(): ConveneRepository = LocalContext.current.repository()
