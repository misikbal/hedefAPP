package expo.modules.focusguard

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.ByteArrayOutputStream

class GuardOptions : Record {
  @Field val sessionId: String = ""
  @Field val until: Double = 0.0
  @Field val mode: String = FocusGuardState.MODE_APPS
  @Field val blocked: List<String> = emptyList()
  @Field val allowed: List<String> = emptyList()
  @Field val blockSettings: Boolean = false
}

class FocusGuardModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context yok" }

  override fun definition() = ModuleDefinition {
    Name("FocusGuard")

    Function("isServiceEnabled") { FocusGuardState.isServiceEnabled(context) }

    Function("openAccessibilitySettings") {
      launch(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    Function("openAppDetails") {
      launch(
        Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.fromParts("package", context.packageName, null),
        ),
      )
    }

    Function("getAppLabel") { pkg: String ->
      runCatching {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
      }.getOrNull()
    }

    AsyncFunction("listLaunchableApps") { withIcons: Boolean -> listApps(withIcons) }

    Function("startGuard") { o: GuardOptions ->
      FocusGuardState.start(
        context,
        sessionId = o.sessionId,
        until = o.until.toLong(),
        mode = o.mode,
        blocked = o.blocked,
        allowed = o.allowed,
        blockSettings = o.blockSettings,
      )
    }

    Function("stopGuard") { FocusGuardState.stop(context) }

    Function("getGuardStatus") { FocusGuardState.status(context) }
  }

  private fun launch(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun listApps(withIcons: Boolean): List<Map<String, Any?>> {
    val pm = context.packageManager
    val own = context.packageName
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val seen = HashSet<String>()
    val out = ArrayList<Map<String, Any?>>()
    for (info in FocusGuardState.queryActivities(pm, intent)) {
      val pkg = info.activityInfo?.packageName ?: continue
      if (pkg == own || pkg in FocusGuardState.SETTINGS_PACKAGES || !seen.add(pkg)) continue
      val appInfo = info.activityInfo.applicationInfo
      val label = runCatching { pm.getApplicationLabel(appInfo).toString() }.getOrNull()
        ?: info.loadLabel(pm).toString()
      val icon = if (withIcons) runCatching { encodeIcon(info.loadIcon(pm)) }.getOrNull() else null
      out.add(mapOf("packageName" to pkg, "label" to label, "icon" to icon))
    }
    return out
  }

  private fun encodeIcon(drawable: Drawable): String {
    val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, ICON_PX, ICON_PX)
    drawable.draw(canvas)
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
    bitmap.recycle()
    return "data:image/png;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
  }

  companion object {
    private const val ICON_PX = 64
  }
}
