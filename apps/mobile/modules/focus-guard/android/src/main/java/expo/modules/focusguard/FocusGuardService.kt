package expo.modules.focusguard

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.view.accessibility.AccessibilityEvent
import android.view.inputmethod.InputMethodManager

/**
 * Öne gelen pencerenin paket adına bakar; engelliyse ana ekrana döner ve Takip'i
 * `takip://focus/blocked?pkg=<paket>` ile öne getirir. Pencere içeriği okunmaz
 * (`canRetrieveWindowContent=false`), hiçbir veri cihazdan çıkmaz.
 */
class FocusGuardService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastPkg: String? = null
  private var lastAt = 0L
  private var systemAllow: Set<String> = emptySet()
  private var systemAllowAt = 0L

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName) return

    val cfg = FocusGuardState.read(this)
    val now = System.currentTimeMillis()
    if (!cfg.isEnforcing(now) || !shouldBlock(pkg, cfg)) return
    // Aynı uygulama art arda birkaç pencere olayı üretir; tek engel sayılır.
    if (pkg == lastPkg && now - lastAt < THROTTLE_MS) return
    lastPkg = pkg
    lastAt = now

    FocusGuardState.recordBlock(this, pkg, now)
    performGlobalAction(GLOBAL_ACTION_HOME)
    // Ana ekran açılışı bizim etkinliğimizin üstüne binmesin diye kısa gecikme.
    handler.postDelayed({ openBlockedScreen(pkg) }, LAUNCH_DELAY_MS)
  }

  override fun onInterrupt() = Unit

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  private fun shouldBlock(pkg: String, cfg: FocusGuardState.Config): Boolean {
    if (pkg in FocusGuardState.SETTINGS_PACKAGES) return cfg.blockSettings
    return when (cfg.mode) {
      FocusGuardState.MODE_ALL -> pkg !in cfg.allowed && pkg !in systemAllowList()
      else -> pkg in cfg.blocked
    }
  }

  /** Tam odak modunda her zaman izinli olanlar: ana ekran, sistem arayüzü, klavye, telefon. */
  private fun systemAllowList(): Set<String> {
    val now = System.currentTimeMillis()
    if (now - systemAllowAt < ALLOW_CACHE_MS && systemAllow.isNotEmpty()) return systemAllow
    val set = HashSet<String>(ALWAYS_ALLOWED)
    set.add(packageName)
    runCatching {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      FocusGuardState.queryActivities(packageManager, home)
        .forEach { set.add(it.activityInfo.packageName) }
    }
    runCatching {
      val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.enabledInputMethodList.forEach { set.add(it.packageName) }
    }
    runCatching {
      val telecom = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      telecom.defaultDialerPackage?.let { set.add(it) }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        telecom.systemDialerPackage?.let { set.add(it) }
      }
    }
    systemAllow = set
    systemAllowAt = now
    return set
  }

  private fun openBlockedScreen(pkg: String) {
    val uri = Uri.parse("$DEEP_LINK?pkg=${Uri.encode(pkg)}")
    val view = Intent(Intent.ACTION_VIEW, uri)
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val ok = runCatching { startActivity(view) }.isSuccess
    if (!ok) {
      packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { startActivity(launch) }
      }
    }
  }

  companion object {
    private const val DEEP_LINK = "takip://focus/blocked"
    private const val THROTTLE_MS = 1000L
    private const val LAUNCH_DELAY_MS = 250L
    private const val ALLOW_CACHE_MS = 60_000L
    private val ALWAYS_ALLOWED = setOf(
      "android",
      "com.android.systemui",
      "com.android.server.telecom",
      "com.android.phone",
      "com.android.emergency",
      "com.google.android.dialer",
      "com.android.dialer",
      "com.android.permissioncontroller",
      "com.google.android.permissioncontroller",
      "com.android.intentresolver",
    )
  }
}
