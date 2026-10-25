package org.convene.app

import android.app.Application
import org.convene.app.data.ApiClient
import org.convene.app.data.ConveneRepository
import org.convene.app.data.HostKeys

/** Holds the app's single repository; small enough that a DI framework would be overkill. */
class ConveneApplication : Application() {
    lateinit var repository: ConveneRepository
        private set

    override fun onCreate() {
        super.onCreate()
        repository = ConveneRepository(ApiClient(BuildConfig.BASE_URL), HostKeys(this), BuildConfig.BASE_URL)
    }
}
