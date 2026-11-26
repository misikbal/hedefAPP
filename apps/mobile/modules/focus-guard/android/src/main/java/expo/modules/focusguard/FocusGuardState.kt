package expo.modules.focusguard

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.os.Build
import android.provider.Settings

/**
 * Engel durumu SharedPreferences'ta tutulur: JS kapalıyken ya da uygulama öldürülmüşken de
 * erişilebilirlik hizmeti aynı kararı verir. `until` geçtiyse engel kendiliğinden pasiftir.
 */
object FocusGuardState {
  private const val PREFS = "takip.focus_guard"
  private const val K_ACTIVE = "active"
  private const val K_UNTIL = "until"
  private const val K_MODE = "mode"
  private const val K_BLOCKED = "blocked"
  private const val K_ALLOWED = "allowed"
  private const val K_BLOCK_SETTINGS = "blockSettings"
  private const val K_SESSION = "sessionId"
  private const val K_ATTEMPTS = "attempts"
  private const val K_LAST_BLOCKED = "lastBlocked"
  private const val K_LAST_BLOCKED_AT = "lastBlockedAt"

  const val MODE_APPS = "apps"
  const val MODE_ALL = "all"

  /** Katı modda engellenen kaçış yolları: Ayarlar (hizmeti kapatma) ve kaldırma ekranı. */
  val SETTINGS_PACKAGES = setOf(
    "com.android.settings",
    "com.android.packageinstaller",
    "com.google.android.packageinstaller",
  )

  data class Config(
    val active: Boolean,
    val until: Long,
    val mode: String,
    val blocked: Set<String>,
    val allowed: Set<String>,
    val blockSettings: Boolean,
  ) {
    fun isEnforcing(now: Long) = active && now < until
  }

  private fun prefs(ctx: Context): SharedPreferences =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun read(ctx: Context): Config {
    val p = prefs(ctx)
    return Config(
      active = p.getBoolean(K_ACTIVE, false),
      until = p.getLong(K_UNTIL, 0L),
      mode = p.getString(K_MODE, MODE_APPS) ?: MODE_APPS,
      blocked = p.getStringSet(K_BLOCKED, emptySet())?.toSet() ?: emptySet(),
      allowed = p.getStringSet(K_ALLOWED, emptySet())?.toSet() ?: emptySet(),
      blockSettings = p.getBoolean(K_BLOCK_SETTINGS, false),
    )
  }

  fun start(
    ctx: Context,
    sessionId: String,
    until: Long,
    mode: String,
    blocked: Collection<String>,
    allowed: Collection<String>,
    blockSettings: Boolean,
  ) {
    val p = prefs(ctx)
    val sameSession = p.getString(K_SESSION, null) == sessionId
    p.edit().apply {
      putBoolean(K_ACTIVE, true)
      putLong(K_UNTIL, until)
      putString(K_MODE, if (mode == MODE_ALL) MODE_ALL else MODE_APPS)
      putStringSet(K_BLOCKED, blocked.toSet())
      putStringSet(K_ALLOWED, allowed.toSet())
      putBoolean(K_BLOCK_SETTINGS, blockSettings)
      putString(K_SESSION, sessionId)
      if (!sameSession) {
        putInt(K_ATTEMPTS, 0)
        remove(K_LAST_BLOCKED)
        remove(K_LAST_BLOCKED_AT)
      }
    }.apply()
  }

  fun stop(ctx: Context) {
    prefs(ctx).edit().putBoolean(K_ACTIVE, false).apply()
  }

  fun recordBlock(ctx: Context, pkg: String, at: Long) {
    val p = prefs(ctx)
    p.edit()
      .putInt(K_ATTEMPTS, p.getInt(K_ATTEMPTS, 0) + 1)
      .putString(K_LAST_BLOCKED, pkg)
      .putLong(K_LAST_BLOCKED_AT, at)
      .apply()
  }

  fun status(ctx: Context): Map<String, Any?> {
    val p = prefs(ctx)
    val cfg = read(ctx)
    return mapOf(
      "active" to cfg.isEnforcing(System.currentTimeMillis()),
      "until" to cfg.until.toDouble(),
      "mode" to cfg.mode,
      "sessionId" to p.getString(K_SESSION, null),
      "attempts" to p.getInt(K_ATTEMPTS, 0),
      "lastBlocked" to p.getString(K_LAST_BLOCKED, null),
      "lastBlockedAt" to p.getLong(K_LAST_BLOCKED_AT, 0L).toDouble(),
    )
  }

  fun isServiceEnabled(ctx: Context): Boolean {
    val enabled = Settings.Secure.getString(
      ctx.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    val me = ComponentName(ctx, FocusGuardService::class.java)
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
  }

  @Suppress("DEPRECATION")
  fun queryActivities(pm: PackageManager, intent: Intent): List<ResolveInfo> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
    } else {
      pm.queryIntentActivities(intent, 0)
    }
}
