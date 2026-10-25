package org.convene.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import org.convene.app.ui.AccentButton
import org.convene.app.ui.AuthViewModel
import org.convene.app.ui.ErrorText
import org.convene.app.ui.theme.Convene

@Composable
fun AuthScreen(
    startWithSignUp: Boolean,
    onBack: () -> Unit,
    onSignedIn: () -> Unit,
    vm: AuthViewModel = viewModel(factory = AuthViewModel.Factory),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    var signUp by rememberSaveable { mutableStateOf(startWithSignUp) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    // Dropping the keyboard on submit keeps any error message below the fields in view.
    val submit = { focus.clearFocus(); vm.submit(signUp, name, email, password) }

    LaunchedEffect(state.done) { if (state.done) onSignedIn() }

    ScreenScaffold(title = if (signUp) "Create account" else "Sign in", onBack = onBack) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                if (signUp) "Create your Convene account" else "Welcome back",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                if (signUp) "Schedule meetings, see who attended, and host from any device."
                else "Sign in to see your meetings and host them from this phone.",
                color = Convene.Muted,
            )
            Spacer(Modifier.height(4.dp))
            val field = Modifier.fillMaxWidth()
            val shape = RoundedCornerShape(12.dp)
            if (signUp) {
                OutlinedTextField(
                    name, { name = it; vm.clearError() }, field,
                    label = { Text("Name") }, singleLine = true, shape = shape,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
            }
            OutlinedTextField(
                email, { email = it; vm.clearError() }, field,
                label = { Text("Email") }, singleLine = true, shape = shape,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next, autoCorrectEnabled = false),
            )
            OutlinedTextField(
                password, { password = it; vm.clearError() }, field,
                label = { Text("Password") }, singleLine = true, shape = shape,
                supportingText = if (signUp) ({ Text("At least 8 characters") }) else null,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
            ErrorText(state.error)
            AccentButton(
                text = if (signUp) "Create account" else "Sign in",
                onClick = submit,
                busy = state.busy,
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(onClick = { signUp = !signUp; vm.clearError() }, modifier = Modifier.fillMaxWidth()) {
                Text(if (signUp) "Already have an account? Sign in" else "New to Convene? Create an account")
            }
        }
    }
}
