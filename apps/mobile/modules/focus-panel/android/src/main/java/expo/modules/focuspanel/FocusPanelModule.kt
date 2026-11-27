package expo.modules.focuspanel

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class PanelGoal : Record {
  @Field val name: String = ""
  /** "3/5 saat" */
  @Field val value: String = ""
  /** 0–1 */
  @Field val progress: Double = 0.0
  @Field val done: Boolean = false
}

class PanelPenalty : Record {
  @Field val text: String = ""
  /** "18:00'e kadar" */
  @Field val due: String = ""
}

class PanelOptions : Record {
  /** running | paused */
  @Field val status: String = "running"
  /** "ODAKTA · KODMIS — tema editörü" */
  @Field val eyebrow: String = ""
  /** Bitiş anı, cihaz saatiyle epoch ms */
  @Field val endAt: Double = 0.0
  /** Planlanan süre (ms); ilerleme çubuğu için */
  @Field val totalMs: Double = 0.0
  /** Duraklatılınca sayacın yerinde (ör. "23 dk") */
  @Field val staticText: String = ""
  /** "Bitiş 14:35 · 50 dk" */
  @Field val meta: String = ""
  /** Kapalı görünümün ikinci parçası / erişilebilirlik metni */
  @Field val summary: String = ""
  @Field val goalsTitle: String = ""
  @Field val goals: List<PanelGoal> = emptyList()
  @Field val penaltiesTitle: String = ""
  @Field val penalties: List<PanelPenalty> = emptyList()
  /** Panele dokununca açılan bağlantı */
  @Field val openUrl: String = "takip://focus"
  /** Düğme: "Duraklat" / "Devam et" ve bağlantısı (boşsa düğme yok) */
  @Field val actionLabel: String = ""
  @Field val actionUrl: String = ""
}

class FocusPanelModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context yok" }

  override fun definition() = ModuleDefinition {
    Name("FocusPanel")

    Function("show") { o: PanelOptions -> FocusPanelNotifier.show(context.applicationContext, o) }

    Function("hide") { FocusPanelNotifier.hide(context.applicationContext) }
  }
}
