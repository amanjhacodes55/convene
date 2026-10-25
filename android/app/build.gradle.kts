plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// One place to point the app at a self-hosted Convene: -PconveneBaseUrl=https://… or gradle.properties.
val conveneBaseUrl = (providers.gradleProperty("conveneBaseUrl").orNull ?: "https://convene-meet.netlify.app").trimEnd('/')
val conveneHost = conveneBaseUrl.substringAfter("://").substringBefore('/').substringBefore(':')

android {
    namespace = "org.convene.app"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "org.convene.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "BASE_URL", "\"$conveneBaseUrl\"")
        // Lets the manifest's deep-link filter follow the configured server.
        manifestPlaceholders["conveneHost"] = conveneHost
    }

    buildTypes {
        release {
            optimization {
                enable = true
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
