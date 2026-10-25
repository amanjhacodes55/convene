package org.convene.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.time.Instant

/** Everything the screens need from the server, with the signed-in user kept as shared state. */
class ConveneRepository(private val api: ApiClient, private val hostKeys: HostKeys, val baseUrl: String) {
    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _sessionChecked = MutableStateFlow(false)
    val sessionChecked: StateFlow<Boolean> = _sessionChecked.asStateFlow()

    suspend fun refreshUser() {
        try {
            _user.value = api.get("/api/auth/me").optJSONObject("user")?.toUser()
        } catch (e: ApiException) {
            if (e.status == 401) _user.value = null
        } catch (_: Exception) {
            // Offline: keep whatever we knew rather than signing the person out.
        } finally {
            _sessionChecked.value = true
        }
    }

    suspend fun signIn(email: String, password: String) {
        val body = JSONObject().put("email", email).put("password", password)
        _user.value = api.post("/api/auth/signin", body).getJSONObject("user").toUser()
    }

    suspend fun signUp(name: String, email: String, password: String) {
        val body = JSONObject().put("name", name).put("email", email).put("password", password)
        _user.value = api.post("/api/auth/signup", body).getJSONObject("user").toUser()
    }

    suspend fun signOut() {
        try {
            api.post("/api/auth/signout")
        } finally {
            api.clearSession()
            _user.value = null
        }
    }

    suspend fun meetings(): List<Meeting> = api.get("/api/meetings").toMeetingList()

    suspend fun meeting(code: String): MeetingDetail = api.get("/api/meetings/$code").toMeetingDetail()

    suspend fun deleteMeeting(code: String) {
        api.delete("/api/meetings/$code")
    }

    suspend fun room(code: String): RoomInfo = api.get("/api/rooms/$code").toRoomInfo()

    /**
     * Starts a meeting right now. Signed in, it belongs to the account (and shows on the dashboard);
     * otherwise it is an anonymous room whose host key is the only way back in as host.
     */
    suspend fun startInstant(): CreatedMeeting {
        val json = if (_user.value != null) {
            api.post("/api/meetings", JSONObject().put("topic", "${_user.value!!.name.ifBlank { "My" }}'s meeting"))
        } else {
            api.post("/api/rooms")
        }
        return CreatedMeeting(json.getString("code"), json.getString("hostKey")).also { hostKeys.put(it.code, it.hostKey) }
    }

    suspend fun schedule(topic: String, agenda: String, start: Instant, durationMinutes: Int, waitingRoom: Boolean): CreatedMeeting {
        val body = JSONObject()
            .put("topic", topic)
            .put("agenda", agenda)
            .put("start_time", start.toString())
            .put("duration", durationMinutes)
            .put("settings", JSONObject().put("waiting_room", waitingRoom))
        val json = api.post("/api/meetings", body)
        return CreatedMeeting(json.getString("code"), json.getString("hostKey")).also { hostKeys.put(it.code, it.hostKey) }
    }

    /** A start link (…/m/<code>#host=<key>) makes this device the host; keep the key for later rejoins. */
    fun rememberHostKey(code: String, key: String) = hostKeys.put(code, key)

    /** The page for a meeting, carrying our host key (if any) the same way the web's start links do. */
    fun meetingUrl(code: String): String {
        val key = hostKeys.get(code)
        return "$baseUrl/m/$code" + if (key != null) "#host=$key" else ""
    }

    fun joinLink(code: String) = "$baseUrl/m/$code"
}
