package org.convene.app.ui.screens

import android.content.ClipData
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import org.convene.app.R
import org.convene.app.data.AttendanceRow
import org.convene.app.data.MeetingDetail
import org.convene.app.data.MeetingStatus
import org.convene.app.data.Participant
import org.convene.app.ui.AccentButton
import org.convene.app.ui.ErrorText
import org.convene.app.ui.Glyph
import org.convene.app.ui.MeetingDetailViewModel
import org.convene.app.ui.StatusBadge
import org.convene.app.ui.dayLabel
import org.convene.app.ui.formatDuration
import org.convene.app.ui.openCall
import org.convene.app.ui.shareInvitation
import org.convene.app.ui.theme.Convene
import org.convene.app.ui.timeLabel

@Composable
fun MeetingDetailScreen(
    onBack: () -> Unit,
    onDeleted: () -> Unit,
    vm: MeetingDetailViewModel = viewModel(factory = MeetingDetailViewModel.Factory),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var confirmDelete by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(state.deleted) { if (state.deleted) onDeleted() }
    // Participants change while the meeting runs, and we may be returning from it.
    var resumes by rememberSaveable { mutableStateOf(0) }
    LifecycleResumeEffect(Unit) {
        if (resumes++ > 0) vm.load()
        onPauseOrDispose { }
    }

    ScreenScaffold(
        title = "Meeting",
        onBack = onBack,
        actions = {
            IconButton(onClick = vm::load) { Glyph(R.drawable.ic_refresh, "Refresh") }
            IconButton(onClick = { confirmDelete = true }, enabled = state.detail != null && !state.deleting) {
                Glyph(R.drawable.ic_delete, "Delete meeting", tint = Convene.Danger)
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ErrorText(state.error)
            val detail = state.detail
            if (detail == null) {
                if (state.loading) {
                    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                }
                return@Column
            }
            Info(detail, vm.link())
            if (detail.meeting.status != MeetingStatus.ENDED) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AccentButton(
                        text = if (detail.meeting.status == MeetingStatus.STARTED) "Join" else "Start",
                        icon = R.drawable.ic_videocam,
                        onClick = { context.openCall(detail.meeting.id) },
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(
                        onClick = { context.shareInvitation(detail.meeting, vm.link()) },
                        modifier = Modifier.weight(1f).height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Glyph(R.drawable.ic_share, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Invite")
                    }
                }
            }
            if (detail.meeting.status == MeetingStatus.STARTED || detail.participants.isNotEmpty()) {
                People("In the meeting now", detail.participants, empty = "Nobody is in the meeting right now.")
                if (detail.waiting.isNotEmpty()) People("Waiting to be admitted", detail.waiting, empty = "")
            }
            Report(detail.report)
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this meeting?") },
            text = { Text("Its link stops working and its attendance report is removed. This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; vm.delete() }) { Text("Delete", color = Convene.Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Info(detail: MeetingDetail, link: String) {
    val m = detail.meeting
    val context = LocalContext.current
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    Panel {
        StatusBadge(m)
        Text(m.topic, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        val time = m.displayTime
        InfoLine("When", "${time.dayLabel()}, ${time.timeLabel()}" + (m.durationMinutes?.let { " · $it min" } ?: ""))
        InfoLine("Meeting ID", m.id, mono = true)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { InfoLine("Link", link, mono = true) }
            TextButton(onClick = {
                scope.launch {
                    clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("Meeting link", link)))
                    Toast.makeText(context, "Link copied", Toast.LENGTH_SHORT).show()
                }
            }) { Text("Copy") }
        }
        InfoLine("Waiting room", if (m.waitingRoom) "On" else "Off")
        if (m.locked) InfoLine("Locked", "No one new can join")
        if (m.agenda.isNotBlank()) InfoLine("Agenda", m.agenda)
    }
}

@Composable
private fun InfoLine(label: String, value: String, mono: Boolean = false) {
    Column {
        Text(label, color = Convene.Muted, style = MaterialTheme.typography.labelMedium)
        Text(value, fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun People(title: String, people: List<Participant>, empty: String) {
    Panel {
        Text("$title (${people.size})", fontWeight = FontWeight.SemiBold)
        if (people.isEmpty()) Text(empty, color = Convene.Muted, style = MaterialTheme.typography.bodyMedium)
        people.forEach { p ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(p.name, 30)
                Spacer(Modifier.width(10.dp))
                Text(p.name, Modifier.weight(1f))
                if (p.host) HostTag()
                p.joinedAt?.let { Text(" ${it.timeLabel()}", color = Convene.Muted, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun HostTag() {
    Text(
        "Host",
        color = Convene.AccentStart,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Convene.AccentStart.copy(alpha = 0.15f))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** The attendance report as a table that scrolls sideways on narrow phones instead of wrapping. */
@Composable
private fun Report(rows: List<AttendanceRow>) {
    Panel {
        Text("Attendance report", fontWeight = FontWeight.SemiBold)
        if (rows.isEmpty()) {
            Text("No one has joined yet. Everyone who does is listed here with how long they stayed.", color = Convene.Muted, style = MaterialTheme.typography.bodyMedium)
            return@Panel
        }
        val total = rows.distinctBy { it.name }.size
        Text("$total ${if (total == 1) "person" else "people"} attended", color = Convene.Muted, style = MaterialTheme.typography.bodySmall)
        Column(Modifier.horizontalScroll(rememberScrollState())) {
            ReportRow("Name", "Joined", "Left", "Duration", header = true)
            HorizontalDivider(color = Convene.Border)
            rows.forEach { r ->
                ReportRow(
                    r.name + if (r.host) " (host)" else "",
                    r.joinedAt?.timeLabel() ?: "—",
                    r.leftAt?.timeLabel() ?: "In meeting",
                    formatDuration(r.durationSeconds),
                )
            }
        }
    }
}

@Composable
private fun ReportRow(name: String, joined: String, left: String, duration: String, header: Boolean = false) {
    val color = if (header) Convene.Muted else MaterialTheme.colorScheme.onSurface
    val style = if (header) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium
    Row(Modifier.padding(vertical = 8.dp)) {
        Text(name, Modifier.width(150.dp), color = color, style = style, maxLines = 1)
        Text(joined, Modifier.width(84.dp), color = color, style = style)
        Text(left, Modifier.width(96.dp), color = color, style = style)
        Text(duration, Modifier.width(80.dp), color = color, style = style)
    }
}
