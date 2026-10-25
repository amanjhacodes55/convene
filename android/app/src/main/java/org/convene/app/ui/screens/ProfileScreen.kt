package org.convene.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import org.convene.app.BuildConfig
import org.convene.app.ui.ProfileViewModel
import org.convene.app.ui.theme.Convene

@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onSignedOut: () -> Unit,
    vm: ProfileViewModel = viewModel(factory = ProfileViewModel.Factory),
) {
    val user by vm.user.collectAsStateWithLifecycle()
    val signingOut by vm.signingOut.collectAsStateWithLifecycle()

    ScreenScaffold(title = "Profile", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val u = user
            Avatar(u?.name?.ifBlank { u.email } ?: "?", 84)
            Text(u?.name ?: "Not signed in", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            u?.let { Text(it.email, color = Convene.Muted) }
            Panel {
                Text("Server", color = Convene.Muted, style = MaterialTheme.typography.labelMedium)
                Text(vm.server)
                Text("App version", color = Convene.Muted, style = MaterialTheme.typography.labelMedium)
                Text(BuildConfig.VERSION_NAME)
            }
            OutlinedButton(
                onClick = { vm.signOut(onSignedOut) },
                enabled = !signingOut && u != null,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
            ) { Text(if (signingOut) "Signing out…" else "Sign out", color = Convene.Danger) }
        }
    }
}
