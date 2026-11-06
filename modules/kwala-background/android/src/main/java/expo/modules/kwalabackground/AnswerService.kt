package expo.modules.kwalabackground

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * A short foreground service that runs while a chat answer streams. Android
 * cuts a backgrounded app's network almost at once, which dropped the answer
 * whenever the user switched apps; a foreground service keeps it. Android 14+
 * gives a `shortService` about three minutes, longer than any answer, and stops
 * it through onTimeout if it is ever left running.
 */
class AnswerService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Answers in progress", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while Kwala Intel finishes an answer in the background."
          setShowBadge(false)
        }
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.kwala_notification)
      .setContentTitle("Kwala Intel")
      .setContentText("Finishing your answer…")
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(open)
      .build()
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE else 0
    try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    } catch (e: Exception) {
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int) {
    stopSelf()
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  companion object {
    private const val CHANNEL = "kwala-answers"
    private const val NOTIFICATION_ID = 4102
  }
}
