package org.convene.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import org.convene.app.R
import org.convene.app.data.Meeting
import org.convene.app.data.MeetingStatus
import org.convene.app.ui.ErrorText
import org.convene.app.ui.Glyph
import org.convene.app.ui.MeetingsViewModel
import org.convene.app.ui.dayOfMonth
import org.convene.app.ui.month
import org.convene.app.ui.openCall
import org.convene.app.ui.repository
import org.convene.app.ui.shareInvitation
import org.convene.app.ui.theme.Convene
import org.convene.app.ui.timeLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeetingsScreen(
    onBack: () -> Unit,
    onSchedule: () -> Unit,
    onOpen: (String) -> Unit,
    vm: MeetingsViewModel = viewModel(factory = MeetingsViewModel.Factory),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }

    // Coming back from a call or the detail screen: statuses may have changed, so look again.
    var firstResume by rememberSaveable { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        if (firstResume++ > 0) vm.load()
        onPauseOrDispose { }
    }

    ScreenScaffold(
        title = "Meetings",
        onBack = onBack,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onSchedule,
                containerColor = Convene.AccentStart,
                contentColor = Color.White,
                icon = { Glyph(R.drawable.ic_add, null, tint = Color.White) },
                text = { Text("Schedule") },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            PrimaryTabRow(selectedTabIndex = tab, containerColor = Convene.Bg) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Upcoming") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Previous") })
            }
            PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = vm::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                val list = if (tab == 0) state.upcoming else state.previous
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    state.error?.let { item { ErrorText(it) } }
                    when {
                        state.loading -> item {
                            Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                        }
                        list.isEmpty() && state.error == null -> item {
                            Empty(if (tab == 0) "No upcoming meetings. Schedule one, or start one from Home." else "Meetings you've held will show up here.")
                        }
                        else -> items(list, key = { it.id }) { MeetingRow(it, onOpen) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Empty(text: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 56.dp, horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Glyph(R.drawable.ic_event, null, Modifier.size(40.dp), tint = Convene.Muted)
        Spacer(Modifier.height(12.dp))
        Text(text, color = Convene.Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun MeetingRow(meeting: Meeting, onOpen: (String) -> Unit) {
    val context = LocalContext.current
    val time = meeting.displayTime
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Convene.Panel)
            .border(1.dp, Convene.Border, RoundedCornerShape(16.dp))
            .clickable { onOpen(meeting.id) }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The date block, like a calendar page.
        Column(
            Modifier
                .width(52.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Convene.PanelHigh)
                .padding(vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(time.month(), color = Convene.AccentStart, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(time.dayOfMonth(), fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(meeting.topic, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                buildString {
                    append(time.timeLabel())
                    meeting.durationMinutes?.let { append(" · $it min") }
                },
                color = Convene.Muted,
                style = MaterialTheme.typography.bodySmall,
            )
            org.convene.app.ui.StatusBadge(meeting)
        }
        if (meeting.status != MeetingStatus.ENDED) {
            IconButton(onClick = { context.shareInvitation(meeting, context.repository().joinLink(meeting.id)) }) {
                Glyph(R.drawable.ic_share, "Share invitation", tint = Convene.Muted)
            }
            FilledTonalButton(
                onClick = { context.openCall(meeting.id) },
                contentPadding = PaddingValues(horizontal = 14.dp),
                shape = RoundedCornerShape(10.dp),
            ) { Text(if (meeting.status == MeetingStatus.STARTED) "Join" else "Start") }
        }
    }
}
