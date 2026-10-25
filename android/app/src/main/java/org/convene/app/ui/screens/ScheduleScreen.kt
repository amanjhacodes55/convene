package org.convene.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import org.convene.app.R
import org.convene.app.ui.AccentButton
import org.convene.app.ui.ErrorText
import org.convene.app.ui.Glyph
import org.convene.app.ui.ScheduleViewModel
import org.convene.app.ui.dayLabel
import org.convene.app.ui.theme.Convene
import org.convene.app.ui.timeLabel
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

private val DURATIONS = listOf(15, 30, 45, 60, 90, 120, 180)

/** The next half hour, at least ten minutes away: what people usually mean by "later today". */
private fun defaultStart(): LocalDateTime {
    val now = LocalDateTime.now().plusMinutes(10).truncatedTo(ChronoUnit.MINUTES)
    val extra = (30 - now.minute % 30) % 30
    return now.plusMinutes(extra.toLong())
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
    vm: ScheduleViewModel = viewModel(factory = ScheduleViewModel.Factory),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val zone = ZoneId.systemDefault()
    val initial = remember { defaultStart() }

    var topic by rememberSaveable { mutableStateOf("") }
    var agenda by rememberSaveable { mutableStateOf("") }
    var dateEpochDay by rememberSaveable { mutableLongStateOf(initial.toLocalDate().toEpochDay()) }
    var minuteOfDay by rememberSaveable { mutableIntStateOf(initial.hour * 60 + initial.minute) }
    var duration by rememberSaveable { mutableIntStateOf(30) }
    var waitingRoom by rememberSaveable { mutableStateOf(false) }
    var pickDate by rememberSaveable { mutableStateOf(false) }
    var pickTime by rememberSaveable { mutableStateOf(false) }

    val start: Instant = LocalDate.ofEpochDay(dateEpochDay)
        .atTime(LocalTime.of(minuteOfDay / 60, minuteOfDay % 60))
        .atZone(zone).toInstant()

    LaunchedEffect(state.created) { state.created?.let(onCreated) }

    ScreenScaffold(title = "Schedule a meeting", onBack = onBack) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val shape = RoundedCornerShape(12.dp)
            OutlinedTextField(
                topic, { topic = it }, Modifier.fillMaxWidth(),
                label = { Text("Topic") }, singleLine = true, shape = shape,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PickerField("Date", start.dayLabel(), R.drawable.ic_event, Modifier.weight(1.3f)) { pickDate = true }
                PickerField("Time", start.timeLabel(), R.drawable.ic_schedule, Modifier.weight(1f)) { pickTime = true }
            }
            DurationField(duration) { duration = it }
            Text("Time zone: ${zone.id}", color = Convene.Muted, style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(
                agenda, { agenda = it }, Modifier.fillMaxWidth(),
                label = { Text("Agenda (optional)") }, minLines = 3, shape = shape,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Waiting room", fontWeight = FontWeight.SemiBold)
                        Text("You admit each person before they join.", color = Convene.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(
                        checked = waitingRoom,
                        onCheckedChange = { waitingRoom = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = Convene.AccentStart),
                    )
                }
            }
            ErrorText(state.error)
            AccentButton(
                text = "Schedule",
                onClick = { vm.submit(topic, agenda, start, duration, waitingRoom) },
                busy = state.busy,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (pickDate) {
        val today = LocalDate.now().toEpochDay()
        val picker = rememberDatePickerState(
            // DatePicker speaks UTC midnights; the chosen calendar day is all we take from it.
            initialSelectedDateMillis = LocalDate.ofEpochDay(dateEpochDay).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis / 86_400_000L >= today
            },
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    picker.selectedDateMillis?.let { dateEpochDay = it / 86_400_000L }
                    pickDate = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(picker) }
    }

    if (pickTime) {
        val context = LocalContext.current
        val picker = rememberTimePickerState(
            initialHour = minuteOfDay / 60,
            initialMinute = minuteOfDay % 60,
            is24Hour = android.text.format.DateFormat.is24HourFormat(context),
        )
        AlertDialog(
            onDismissRequest = { pickTime = false },
            confirmButton = {
                TextButton(onClick = {
                    minuteOfDay = picker.hour * 60 + picker.minute
                    pickTime = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text("Cancel") } },
            text = { TimePicker(picker) },
        )
    }
}

@Composable
private fun PickerField(label: String, value: String, icon: Int, modifier: Modifier, onClick: () -> Unit) {
    // A read-only text field that opens a picker: looks like the other fields, can't be typed into.
    Box(modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            singleLine = true,
            leadingIcon = { Glyph(icon, null, tint = Convene.Muted) },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Box(Modifier.matchParentSize().clickable(onClick = onClick))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DurationField(duration: Int, onChange: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = label(duration),
            onValueChange = {},
            readOnly = true,
            label = { Text("Duration") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DURATIONS.forEach { d ->
                DropdownMenuItem(text = { Text(label(d)) }, onClick = { onChange(d); open = false })
            }
        }
    }
}

private fun label(minutes: Int) = when {
    minutes < 60 -> "$minutes minutes"
    minutes % 60 == 0 -> "${minutes / 60} hour" + if (minutes > 60) "s" else ""
    else -> "${minutes / 60} h ${minutes % 60} min"
}
