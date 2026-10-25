package org.convene.app.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

data class User(val id: String, val email: String, val name: String)

enum class MeetingStatus { WAITING, STARTED, ENDED }

data class Meeting(
    val id: String,
    val topic: String,
    val agenda: String,
    val status: MeetingStatus,
    val startTime: Instant?,
    val durationMinutes: Int?,
    val createdAt: Instant,
    val startedAt: Instant?,
    val endedAt: Instant?,
    val joinUrl: String,
    val waitingRoom: Boolean,
    val locked: Boolean,
) {
    /** When the meeting is (or was) on: its schedule, else when it actually ran, else when it was made. */
    val displayTime: Instant get() = startTime ?: startedAt ?: createdAt
}

data class Participant(val id: String, val name: String, val host: Boolean, val joinedAt: Instant?)

data class AttendanceRow(
    val id: String,
    val name: String,
    val host: Boolean,
    val joinedAt: Instant?,
    val leftAt: Instant?,
    val durationSeconds: Long,
    val reason: String?,
)

data class MeetingDetail(
    val meeting: Meeting,
    val participants: List<Participant>,
    val waiting: List<Participant>,
    val report: List<AttendanceRow>,
)

data class RoomInfo(
    val code: String,
    val title: String,
    val locked: Boolean,
    val waitingRoom: Boolean,
    val ended: Boolean,
    val owner: Boolean,
)

data class CreatedMeeting(val code: String, val hostKey: String)

// org.json returns the string "null" from optString for JSON null, so nullable reads go through here.
internal fun JSONObject.str(key: String): String? = if (isNull(key)) null else optString(key)
internal fun JSONObject.instant(key: String): Instant? = str(key)?.let { runCatching { Instant.parse(it) }.getOrNull() }
private inline fun <T> JSONArray?.mapObjects(f: (JSONObject) -> T): List<T> =
    if (this == null) emptyList() else List(length()) { f(getJSONObject(it)) }

internal fun JSONObject.toUser() = User(id = getString("id"), email = optString("email"), name = optString("name"))

internal fun JSONObject.toMeeting(): Meeting {
    val settings = optJSONObject("settings")
    return Meeting(
        id = getString("id"),
        topic = optString("topic").ifBlank { "Meeting" },
        agenda = str("agenda").orEmpty(),
        status = when (optString("status")) {
            "started" -> MeetingStatus.STARTED
            "ended" -> MeetingStatus.ENDED
            else -> MeetingStatus.WAITING
        },
        startTime = instant("start_time"),
        durationMinutes = if (isNull("duration") || !has("duration")) null else optInt("duration"),
        createdAt = instant("created_at") ?: Instant.EPOCH,
        startedAt = instant("started_at"),
        endedAt = instant("ended_at"),
        joinUrl = optString("join_url"),
        waitingRoom = settings?.optBoolean("waiting_room") ?: false,
        locked = settings?.optBoolean("locked") ?: false,
    )
}

private fun JSONObject.toParticipant() =
    Participant(id = optString("id"), name = optString("name"), host = optBoolean("host"), joinedAt = instant("joined_at"))

internal fun JSONObject.toMeetingDetail() = MeetingDetail(
    meeting = getJSONObject("meeting").toMeeting(),
    participants = optJSONArray("participants").mapObjects { it.toParticipant() },
    waiting = optJSONArray("waiting").mapObjects { it.toParticipant() },
    report = optJSONArray("report").mapObjects {
        AttendanceRow(
            id = it.optString("id"),
            name = it.optString("name"),
            host = it.optBoolean("host"),
            joinedAt = it.instant("joined_at"),
            leftAt = it.instant("left_at"),
            durationSeconds = it.optLong("duration"),
            reason = it.str("reason"),
        )
    },
)

internal fun JSONObject.toMeetingList(): List<Meeting> = optJSONArray("meetings").mapObjects { it.toMeeting() }

internal fun JSONObject.toRoomInfo() = RoomInfo(
    code = optString("code"),
    title = optString("title"),
    locked = optBoolean("locked"),
    waitingRoom = optBoolean("waitingRoom"),
    ended = optBoolean("ended"),
    owner = optBoolean("owner"),
)
