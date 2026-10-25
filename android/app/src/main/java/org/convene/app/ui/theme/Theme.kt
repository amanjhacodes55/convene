package org.convene.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

// The web app's palette, so moving between the native screens and the meeting feels like one app.
object Convene {
    val Bg = Color(0xFF0B0D12)
    val Panel = Color(0xFF13161D)
    val PanelHigh = Color(0xFF1A1E27)
    val Border = Color(0xFF242936)
    val Text = Color(0xFFE8EAF0)
    val Muted = Color(0xFF8A90A2)
    val AccentStart = Color(0xFF6D7CFF)
    val AccentEnd = Color(0xFF8F6DFF)
    val Good = Color(0xFF3ECF8E)
    val Danger = Color(0xFFEF4D5A)
    val Accent = Brush.linearGradient(listOf(AccentStart, AccentEnd))
}

private val Scheme = darkColorScheme(
    primary = Convene.AccentStart,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF2A2F5C),
    onPrimaryContainer = Convene.Text,
    secondary = Convene.AccentEnd,
    onSecondary = Color.White,
    tertiary = Convene.Good,
    background = Convene.Bg,
    onBackground = Convene.Text,
    surface = Convene.Bg,
    onSurface = Convene.Text,
    surfaceVariant = Convene.Panel,
    onSurfaceVariant = Convene.Muted,
    surfaceContainerLowest = Convene.Bg,
    surfaceContainerLow = Convene.Panel,
    surfaceContainer = Convene.Panel,
    surfaceContainerHigh = Convene.PanelHigh,
    surfaceContainerHighest = Convene.PanelHigh,
    outline = Convene.Border,
    outlineVariant = Convene.Border,
    error = Convene.Danger,
    onError = Color.White,
)

@Composable
fun ConveneTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, content = content)
}
