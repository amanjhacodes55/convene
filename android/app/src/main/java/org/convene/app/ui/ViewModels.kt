package org.convene.app.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.convene.app.data.ConveneRepository
import org.convene.app.data.Meeting
import org.convene.app.data.MeetingCodes
import org.convene.app.data.MeetingDetail
import org.convene.app.data.MeetingStatus
import java.time.Instant

/** One-shot results the UI reacts to once (open a call, leave a screen), kept out of the persistent state. */
sealed interface Event {
    data class OpenCall(val code: String) : Event
    data class OpenMeeting(val code: String) : Event
    data object Done : Event
}

// ---------------------------------------------------------------- Home

data class HomeState(val busy: Boolean = false, val joining: Boolean = false, val error: String? = null)

class HomeViewModel(private val repo: ConveneRepository) : ViewModel() {
    val user = repo.user
    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()
    private val _events = MutableStateFlow<Event?>(null)
    val events: StateFlow<Event?> = _events.asStateFlow()

    init {
        viewModelScope.launch { repo.refreshUser() }
    }

    fun consumed() { _events.value = null }

    fun newMeeting() {
        if (_state.value.busy) return
        _state.value = HomeState(busy = true)
        viewModelScope.launch {
            runCatching { repo.startInstant() }
                .onSuccess { _events.value = Event.OpenCall(it.code); _state.value = HomeState() }
                .onFailure { _state.value = HomeState(error = it.friendly()) }
        }
    }

    /** Checks the meeting exists before opening a full-screen call that would only say "not found". */
    fun join(input: String) {
        val code = MeetingCodes.parse(input)
        if (code == null) {
            _state.update { it.copy(error = "Enter a meeting code like abc-defg-hij, or paste the invitation link.") }
            return
        }
        _state.value = HomeState(joining = true)
        viewModelScope.launch {
            runCatching { repo.room(code) }
                .onSuccess { room ->
                    if (room.ended) _state.value = HomeState(error = "That meeting has ended.")
                    else { _state.value = HomeState(); _events.value = Event.OpenCall(code) }
                }
                .onFailure { _state.value = HomeState(error = it.friendly()) }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    companion object {
        val Factory = viewModelFactory { initializer { HomeViewModel(repository) } }
    }
}

// ---------------------------------------------------------------- Auth

data class AuthState(val busy: Boolean = false, val error: String? = null, val done: Boolean = false)

class AuthViewModel(private val repo: ConveneRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthState())
    val state: StateFlow<AuthState> = _state.asStateFlow()

    fun submit(signUp: Boolean, name: String, email: String, password: String) {
        val problem = when {
            signUp && name.isBlank() -> "Enter your name."
            !email.contains('@') -> "Enter a valid email address."
            password.isEmpty() -> "Enter your password."
            signUp && password.length < 8 -> "Use at least 8 characters for your password."
            else -> null
        }
        if (problem != null) {
            _state.value = AuthState(error = problem)
            return
        }
        _state.value = AuthState(busy = true)
        viewModelScope.launch {
            runCatching {
                if (signUp) repo.signUp(name.trim(), email.trim(), password) else repo.signIn(email.trim(), password)
            }
                .onSuccess { _state.value = AuthState(done = true) }
                .onFailure { _state.value = AuthState(error = it.friendly()) }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    companion object {
        val Factory = viewModelFactory { initializer { AuthViewModel(repository) } }
    }
}

// ---------------------------------------------------------------- Meetings dashboard

data class MeetingsState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val upcoming: List<Meeting> = emptyList(),
    val previous: List<Meeting> = emptyList(),
    val error: String? = null,
)

class MeetingsViewModel(private val repo: ConveneRepository) : ViewModel() {
    private val _state = MutableStateFlow(MeetingsState())
    val state: StateFlow<MeetingsState> = _state.asStateFlow()

    init { load() }

    fun refresh() = load(pull = true)

    fun load(pull: Boolean = false) {
        _state.update { it.copy(refreshing = pull, loading = !pull && it.upcoming.isEmpty() && it.previous.isEmpty(), error = null) }
        viewModelScope.launch {
            runCatching { repo.meetings() }
                .onSuccess { all ->
                    val (ended, open) = all.partition { it.status == MeetingStatus.ENDED }
                    _state.value = MeetingsState(
                        loading = false,
                        // Live meetings first, then soonest; past meetings most recent first.
                        upcoming = open.sortedWith(compareBy<Meeting> { it.status != MeetingStatus.STARTED }.thenBy { it.displayTime }),
                        previous = ended.sortedByDescending { it.endedAt ?: it.displayTime },
                    )
                }
                .onFailure { e -> _state.update { it.copy(loading = false, refreshing = false, error = e.friendly()) } }
        }
    }

    companion object {
        val Factory = viewModelFactory { initializer { MeetingsViewModel(repository) } }
    }
}

// ---------------------------------------------------------------- Schedule

data class ScheduleState(val busy: Boolean = false, val error: String? = null, val created: String? = null)

class ScheduleViewModel(private val repo: ConveneRepository) : ViewModel() {
    private val _state = MutableStateFlow(ScheduleState())
    val state: StateFlow<ScheduleState> = _state.asStateFlow()

    fun submit(topic: String, agenda: String, start: Instant, duration: Int, waitingRoom: Boolean) {
        if (topic.isBlank()) {
            _state.value = ScheduleState(error = "Give the meeting a topic.")
            return
        }
        if (start.isBefore(Instant.now().minusSeconds(60))) {
            _state.value = ScheduleState(error = "Pick a time in the future.")
            return
        }
        _state.value = ScheduleState(busy = true)
        viewModelScope.launch {
            runCatching { repo.schedule(topic.trim(), agenda.trim(), start, duration, waitingRoom) }
                .onSuccess { _state.value = ScheduleState(created = it.code) }
                .onFailure { _state.value = ScheduleState(error = it.friendly()) }
        }
    }

    companion object {
        val Factory = viewModelFactory { initializer { ScheduleViewModel(repository) } }
    }
}

// ---------------------------------------------------------------- Meeting detail

data class DetailState(
    val loading: Boolean = true,
    val detail: MeetingDetail? = null,
    val error: String? = null,
    val deleting: Boolean = false,
    val deleted: Boolean = false,
)

class MeetingDetailViewModel(private val repo: ConveneRepository, handle: SavedStateHandle) : ViewModel() {
    val code: String = checkNotNull(handle["code"])
    private val _state = MutableStateFlow(DetailState())
    val state: StateFlow<DetailState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { repo.meeting(code) }
                .onSuccess { d -> _state.update { it.copy(loading = false, detail = d) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.friendly()) } }
        }
    }

    fun delete() {
        _state.update { it.copy(deleting = true, error = null) }
        viewModelScope.launch {
            runCatching { repo.deleteMeeting(code) }
                .onSuccess { _state.update { it.copy(deleting = false, deleted = true) } }
                .onFailure { e -> _state.update { it.copy(deleting = false, error = e.friendly()) } }
        }
    }

    fun link() = repo.joinLink(code)

    companion object {
        val Factory = viewModelFactory { initializer { MeetingDetailViewModel(repository, createSavedStateHandle()) } }
    }
}

// ---------------------------------------------------------------- Profile

class ProfileViewModel(private val repo: ConveneRepository) : ViewModel() {
    val user = repo.user
    val server = repo.baseUrl
    private val _signingOut = MutableStateFlow(false)
    val signingOut: StateFlow<Boolean> = _signingOut.asStateFlow()

    fun signOut(then: () -> Unit) {
        _signingOut.value = true
        viewModelScope.launch {
            // Signing out locally must work offline too; the repository clears the cookie regardless.
            runCatching { repo.signOut() }
            _signingOut.value = false
            then()
        }
    }

    companion object {
        val Factory = viewModelFactory { initializer { ProfileViewModel(repository) } }
    }
}
