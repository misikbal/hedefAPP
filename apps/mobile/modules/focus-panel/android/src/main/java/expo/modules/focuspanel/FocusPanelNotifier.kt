package expo.modules.focuspanel

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Odak seansı açıkken bildirim çekmecesinde duran kalıcı panel.
 * Kapalı görünüm: canlı geri sayım (Chronometer) + bitiş saati. Açık görünüm: ayrıca seans ilerlemesi,
 * bugünün hedefleri (ilerleme çubuklu) ve açık cezalar; altta Duraklat/Devam düğmesi.
 * Sayaç sistemde akar (JS gerekmez); ilerleme çubuğu süreç ayaktayken 30 sn'de bir yenilenir.
 * Düğme ve dokunma `takip://` bağlantısı açar; işi uygulama yapar.
 */
object FocusPanelNotifier {
  const val CHANNEL_ID = "focus_panel"
  private const val TAG = "focus-panel"
  private const val NOTIFICATION_ID = 7301
  private const val ACCENT = 0xFFF0A63A.toInt()
  private const val TICK_MS = 30_000L
  /** Bitişten sonra panel bu kadar bekleyip kendiliğinden kalkar (uygulama ölü olsa da) */
  private const val END_GRACE_MS = 2 * 60_000L

  private val handler = Handler(Looper.getMainLooper())
  private var last: PanelOptions? = null
  private val tick = object : Runnable {
    override fun run() {
      val o = last ?: return
      val ctx = appContext ?: return
      if (o.status != "running" || o.endAt.toLong() + END_GRACE_MS < System.currentTimeMillis()) return
      notify(ctx, o)
      handler.postDelayed(this, TICK_MS)
    }
  }
  private var appContext: Context? = null

  fun show(ctx: Context, o: PanelOptions): Boolean {
    appContext = ctx
    last = o
    handler.removeCallbacks(tick)
    val ok = notify(ctx, o)
    if (ok && o.status == "running") handler.postDelayed(tick, TICK_MS)
    return ok
  }

  fun hide(ctx: Context) {
    last = null
    handler.removeCallbacks(tick)
    NotificationManagerCompat.from(ctx).cancel(TAG, NOTIFICATION_ID)
  }

  @SuppressLint("MissingPermission")
  private fun notify(ctx: Context, o: PanelOptions): Boolean {
    val nm = NotificationManagerCompat.from(ctx)
    if (!nm.areNotificationsEnabled()) return false
    ensureChannel(ctx)

    val running = o.status == "running"
    val now = System.currentTimeMillis()
    val remaining = (o.endAt.toLong() - now).coerceAtLeast(0)
    val progress =
      if (o.totalMs > 0) (1.0 - remaining / o.totalMs).coerceIn(0.0, 1.0) else 0.0

    val small = RemoteViews(ctx.packageName, R.layout.focus_panel_small)
    val big = RemoteViews(ctx.packageName, R.layout.focus_panel_big)
    bindHeader(small, o, running, remaining)
    bindHeader(big, o, running, remaining)
    big.setProgressBar(R.id.fp_progress, 1000, (progress * 1000).toInt(), false)
    bindDetails(ctx, big, o)

    val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(smallIcon(ctx))
      .setColor(ACCENT)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(small)
      .setCustomBigContentView(big)
      .setContentTitle(o.eyebrow)
      .setContentText(o.summary)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(viewIntent(ctx, o.openUrl, 0))
    if (o.actionLabel.isNotEmpty() && o.actionUrl.isNotEmpty()) {
      builder.addAction(0, o.actionLabel, viewIntent(ctx, o.actionUrl, 1))
    }
    builder.addAction(0, "Uygulamayı aç", viewIntent(ctx, o.openUrl, 2))
    if (running) builder.setTimeoutAfter(remaining + END_GRACE_MS)

    return try {
      nm.notify(TAG, NOTIFICATION_ID, builder.build())
      true
    } catch (_: SecurityException) {
      false
    }
  }

  private fun bindHeader(rv: RemoteViews, o: PanelOptions, running: Boolean, remaining: Long) {
    rv.setTextViewText(R.id.fp_eyebrow, o.eyebrow)
    rv.setTextViewText(R.id.fp_meta, o.meta)
    if (running) {
      rv.setViewVisibility(R.id.fp_chrono, View.VISIBLE)
      rv.setViewVisibility(R.id.fp_static, View.GONE)
      rv.setChronometer(R.id.fp_chrono, SystemClock.elapsedRealtime() + remaining, null, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        rv.setChronometerCountDown(R.id.fp_chrono, true)
      }
    } else {
      rv.setChronometer(R.id.fp_chrono, SystemClock.elapsedRealtime(), null, false)
      rv.setViewVisibility(R.id.fp_chrono, View.GONE)
      rv.setViewVisibility(R.id.fp_static, View.VISIBLE)
      rv.setTextViewText(R.id.fp_static, o.staticText)
    }
  }

  private fun bindDetails(ctx: Context, big: RemoteViews, o: PanelOptions) {
    big.removeAllViews(R.id.fp_goals)
    val hasGoals = o.goals.isNotEmpty()
    big.setViewVisibility(R.id.fp_goals_title, if (hasGoals) View.VISIBLE else View.GONE)
    big.setTextViewText(R.id.fp_goals_title, o.goalsTitle)
    for (g in o.goals) {
      val row = RemoteViews(
        ctx.packageName,
        if (g.done) R.layout.focus_panel_goal_done else R.layout.focus_panel_goal,
      )
      row.setTextViewText(R.id.fp_goal_name, g.name)
      row.setTextViewText(R.id.fp_goal_value, g.value)
      row.setProgressBar(R.id.fp_goal_bar, 1000, (g.progress.coerceIn(0.0, 1.0) * 1000).toInt(), false)
      big.addView(R.id.fp_goals, row)
    }

    big.removeAllViews(R.id.fp_penalties)
    val hasPen = o.penalties.isNotEmpty()
    big.setViewVisibility(R.id.fp_pen_title, if (hasPen) View.VISIBLE else View.GONE)
    big.setTextViewText(R.id.fp_pen_title, o.penaltiesTitle)
    for (p in o.penalties) {
      val row = RemoteViews(ctx.packageName, R.layout.focus_panel_penalty)
      row.setTextViewText(R.id.fp_pen_text, p.text)
      row.setTextViewText(R.id.fp_pen_due, p.due)
      big.addView(R.id.fp_penalties, row)
    }
  }

  private fun viewIntent(ctx: Context, url: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(ctx.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      ctx,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** expo-notifications eklentisinin ürettiği beyaz siluet; yoksa uygulama ikonu */
  private fun smallIcon(ctx: Context): Int {
    val id = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
    return if (id != 0) id else ctx.applicationInfo.icon
  }

  private fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val ch = NotificationChannel(CHANNEL_ID, "Odak paneli", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Odak sırasında kalan süre, hedefler ve cezalar"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    nm.createNotificationChannel(ch)
  }
}
