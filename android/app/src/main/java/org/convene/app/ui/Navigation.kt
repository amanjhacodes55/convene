package org.convene.app.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.convene.app.ui.screens.AuthScreen
import org.convene.app.ui.screens.HomeScreen
import org.convene.app.ui.screens.MeetingDetailScreen
import org.convene.app.ui.screens.MeetingsScreen
import org.convene.app.ui.screens.ProfileScreen
import org.convene.app.ui.screens.ScheduleScreen

object Routes {
    const val HOME = "home"
    const val AUTH = "auth?signUp={signUp}"
    const val MEETINGS = "meetings"
    const val SCHEDULE = "schedule"
    const val MEETING = "meeting/{code}"
    const val PROFILE = "profile"

    fun auth(signUp: Boolean) = "auth?signUp=$signUp"
    fun meeting(code: String) = "meeting/$code"
}

@Composable
fun ConveneNavHost() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                onSignIn = { nav.navigate(Routes.auth(signUp = false)) },
                onSignUp = { nav.navigate(Routes.auth(signUp = true)) },
                onMeetings = { nav.navigate(Routes.MEETINGS) },
                onSchedule = { nav.navigate(Routes.SCHEDULE) },
                onProfile = { nav.navigate(Routes.PROFILE) },
            )
        }
        composable(
            Routes.AUTH,
            arguments = listOf(navArgument("signUp") { type = NavType.BoolType; defaultValue = false }),
        ) { entry ->
            AuthScreen(
                startWithSignUp = entry.arguments?.getBoolean("signUp") ?: false,
                onBack = { nav.popBackStack() },
                onSignedIn = { nav.popBackStack(Routes.HOME, inclusive = false) },
            )
        }
        composable(Routes.MEETINGS) {
            MeetingsScreen(
                onBack = { nav.popBackStack() },
                onSchedule = { nav.navigate(Routes.SCHEDULE) },
                onOpen = { nav.navigate(Routes.meeting(it)) },
            )
        }
        composable(Routes.SCHEDULE) {
            ScheduleScreen(
                onBack = { nav.popBackStack() },
                onCreated = { code ->
                    // Land on the new meeting with the dashboard underneath it, not the finished form.
                    nav.navigate(Routes.MEETINGS) { popUpTo(Routes.HOME) }
                    nav.navigate(Routes.meeting(code))
                },
            )
        }
        composable(Routes.MEETING, arguments = listOf(navArgument("code") { type = NavType.StringType })) {
            MeetingDetailScreen(
                onBack = { nav.popBackStack() },
                onDeleted = { nav.popBackStack() },
            )
        }
        composable(Routes.PROFILE) {
            ProfileScreen(
                onBack = { nav.popBackStack() },
                onSignedOut = { nav.popBackStack(Routes.HOME, inclusive = false) },
            )
        }
    }
}
