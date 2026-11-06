package expo.modules.kwalabackground

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * "Your answer is ready": posted when an answer finishes while the app is in
 * the background. Tapping it opens the app on that chat. Does nothing when the
 * user has not allowed notifications.
 */
object AnswerReady {
  private const val CHANNEL = "kwala-answer-ready"
  private const val NOTIFICATION_ID = 4103

  fun post(context: Context, title: String, body: String) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
        NotificationChannel(CHANNEL, "Finished answers", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Tells you when an answer is ready while you are in another app."
        }
      )
    }
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 1, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.kwala_notification)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setAutoCancel(true)
      .setContentIntent(open)
      .build()
    try {
      manager.notify(NOTIFICATION_ID, notification)
    } catch (e: SecurityException) {
      // Permission withdrawn between the check and the post.
    }
  }
}
