# Convene for Android

A native Android app (Kotlin + Jetpack Compose, Material 3) for [Convene](../README.md). It talks to the same
server as the web app, so meetings, accounts and attendance reports are shared between the two.

## What it does

- **Home**: start an instant meeting in one tap, join with a code (`abc-defg-hij`) or a pasted invitation link,
  and get to scheduling and your meetings when signed in.
- **Sign in / Create account**: the same accounts as the website.
- **Meetings**: Upcoming and Previous tabs, pull to refresh, a status badge (Live, Scheduled, Ended), Start or
  Join, and an invitation (topic, time, link, meeting ID) shared through the Android share sheet.
- **Schedule**: topic, date and time pickers, duration, agenda and the waiting room switch.
- **Meeting detail**: the meeting's details and link, who is in it right now (and who is waiting), the
  attendance report with when each person joined and left, and delete.
- **Profile**: who you're signed in as, the server, and sign out.
- **Invitation links**: tapping `https://convene-meet.netlify.app/m/<code>` opens the call in the app.

### How the call works

The call screen hosts the web app's meeting page (`/m/<code>`) in a full-screen WebView. WebRTC, the lobby,
the waiting room, chat, reactions and every host control come from the web app, so the two never drift
apart. The native side adds what a WebView can't do by itself:

- asks for the camera and microphone permissions, then grants them to the page (only to the Convene server);
- keeps the screen on and hides the system bars;
- asks before leaving on Back;
- saves recordings (which the page makes as `blob:` WebM files) to Downloads.

Signing in natively also signs in the call: the session cookie lives in the WebView's own cookie store,
which is how the server recognises a meeting's owner as its host on any device. Meetings started without
an account keep their host key on the phone, so you can rejoin them as host.

**Limitation:** Android's WebView does not support `getDisplayMedia`, so you can't share your screen from
the app. You still see other people's screen shares. To present, join from a desktop browser.

## Open in Android Studio

Open the `android/` folder (not the repository root) with **File > Open**. Android Studio creates
`local.properties` pointing at your SDK. You need JDK 17+ (Android Studio's bundled JBR works) and the
Android SDK platform 37.

## Build and install

```bash
cd android
./gradlew assembleDebug                      # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug                       # onto a connected device or a running emulator
adb shell am start -n org.convene.app/.MainActivity
```

If `java` isn't on your `PATH`, point `JAVA_HOME` at Android Studio's JDK, for example
`JAVA_HOME=~/android-studio/jbr ./gradlew assembleDebug`.

## Using your own server

The app uses `https://convene-meet.netlify.app` by default. To build it for a self-hosted Convene, set
`conveneBaseUrl`, either once in `gradle.properties` or per build:

```bash
./gradlew assembleDebug -PconveneBaseUrl=https://meet.example.com
```

That changes the API, the call page and the host name that invitation links open in the app. The server
must be served over HTTPS: Android blocks plain HTTP, and browsers only give a page the camera on a secure
origin. To try a local server on the emulator, put it behind an HTTPS tunnel and use that address.

## Code layout

```
app/src/main/java/org/convene/app/
  ConveneApplication.kt     the app's single repository
  MainActivity.kt           Compose host and invitation-link handling
  data/                     ApiClient (HttpURLConnection + org.json), models, repository, host keys
  ui/                       navigation, ViewModels, theme and the screens
  call/                     CallActivity (the WebView) and the recording downloader
```
