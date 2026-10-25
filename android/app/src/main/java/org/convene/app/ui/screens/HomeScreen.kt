package org.convene.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import org.convene.app.R
import org.convene.app.ui.AccentButton
import org.convene.app.ui.ErrorText
import org.convene.app.ui.Event
import org.convene.app.ui.Glyph
import org.convene.app.ui.HomeViewModel
import org.convene.app.ui.openCall
import org.convene.app.ui.theme.Convene

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onSignIn: () -> Unit,
    onSignUp: () -> Unit,
    onMeetings: () -> Unit,
    onSchedule: () -> Unit,
    onProfile: () -> Unit,
    vm: HomeViewModel = viewModel(factory = HomeViewModel.Factory),
) {
    val context = LocalContext.current
    val user by vm.user.collectAsStateWithLifecycle()
    val state by vm.state.collectAsStateWithLifecycle()
    val event by vm.events.collectAsStateWithLifecycle()
    var code by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current

    LaunchedEffect(event) {
        (event as? Event.OpenCall)?.let { context.openCall(it.code) }
        if (event != null) vm.consumed()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Logo() },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Convene.Bg),
                actions = {
                    val u = user
                    if (u == null) {
                        TextButton(onClick = onSignIn) { Text("Sign in") }
                    } else {
                        IconButton(onClick = onProfile) { Avatar(u.name.ifBlank { u.email }, 34) }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Video meetings for everyone",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "Start a meeting in one tap, or join with a code. No downloads for your guests — they join from any browser.",
                style = MaterialTheme.typography.bodyLarge,
                color = Convene.Muted,
            )

            AccentButton(
                text = "New meeting",
                icon = R.drawable.ic_videocam,
                onClick = vm::newMeeting,
                busy = state.busy,
                modifier = Modifier.fillMaxWidth(),
            )

            Panel {
                Text("Join a meeting", fontWeight = FontWeight.SemiBold)
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it; vm.clearError() },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text("abc-defg-hij or a link") },
                    leadingIcon = { Glyph(R.drawable.ic_link, null, tint = Convene.Muted) },
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        imeAction = ImeAction.Go,
                    ),
                    keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); vm.join(code) }),
                    shape = RoundedCornerShape(12.dp),
                )
                OutlinedButton(
                    onClick = { vm.join(code) },
                    enabled = code.isNotBlank() && !state.joining,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                ) { Text(if (state.joining) "Checking…" else "Join") }
            }

            ErrorText(state.error)

            if (user != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ActionTile("Schedule", "Plan a meeting", R.drawable.ic_event, onSchedule, Modifier.weight(1f))
                    ActionTile("Meetings", "Upcoming & past", R.drawable.ic_list, onMeetings, Modifier.weight(1f))
                }
            } else {
                Panel {
                    Text("Schedule meetings and see who attended", fontWeight = FontWeight.SemiBold)
                    Text(
                        "With an account your meetings are listed in one place, with attendance reports, and you're the host on every device.",
                        color = Convene.Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = onSignIn, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) { Text("Sign in") }
                        AccentButton("Create account", onSignUp, Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
fun Logo() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(Convene.Accent),
            contentAlignment = Alignment.Center,
        ) { Glyph(R.drawable.ic_videocam, null, Modifier.size(18.dp), tint = androidx.compose.ui.graphics.Color.White) }
        Spacer(Modifier.width(10.dp))
        Text("Convene", fontWeight = FontWeight.Bold, fontSize = 20.sp)
    }
}

@Composable
fun Avatar(name: String, sizeDp: Int) {
    Box(
        Modifier.size(sizeDp.dp).clip(RoundedCornerShape(50)).background(Convene.Accent),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.trim().firstOrNull()?.uppercase() ?: "?",
            color = androidx.compose.ui.graphics.Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = (sizeDp * 0.42).sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Convene.Panel)
            .border(1.dp, Convene.Border, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) { content() }
}

@Composable
private fun ActionTile(title: String, subtitle: String, icon: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Convene.Panel)
            .border(1.dp, Convene.Border, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background(Convene.AccentStart.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) { Glyph(icon, null, tint = Convene.AccentStart) }
        Spacer(Modifier.height(4.dp))
        Text(title, fontWeight = FontWeight.SemiBold)
        Text(subtitle, color = Convene.Muted, style = MaterialTheme.typography.bodySmall)
    }
}
