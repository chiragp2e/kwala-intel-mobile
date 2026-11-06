package expo.modules.kwalabackground

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger

/**
 * The same begin/end handles as the iOS module: while any handle is open the
 * AnswerService runs, so a streaming answer keeps its connection when the user
 * leaves the app. notify() posts "Your answer is ready" once it has finished.
 */
class KwalaBackgroundModule : Module() {
  private val next = AtomicInteger(0)
  private val open = Collections.synchronizedSet(mutableSetOf<Int>())

  override fun definition() = ModuleDefinition {
    Name("KwalaBackground")

    // Returns a handle for end(); -1 when the service could not start.
    Function("begin") { _: String ->
      val context = appContext.reactContext ?: return@Function -1
      val handle = next.incrementAndGet()
      try {
        ContextCompat.startForegroundService(context, Intent(context, AnswerService::class.java))
        open.add(handle)
        handle
      } catch (e: Exception) {
        -1
      }
    }

    Function("end") { handle: Int ->
      val context = appContext.reactContext ?: return@Function
      if (open.remove(handle) && open.isEmpty()) {
        context.stopService(Intent(context, AnswerService::class.java))
      }
    }

    // "Your answer is ready" (AnswerReady). The permission is asked from JS (PermissionsAndroid).
    Function("notify") { title: String, body: String ->
      val context = appContext.reactContext ?: return@Function
      AnswerReady.post(context, title, body)
    }
  }
}
