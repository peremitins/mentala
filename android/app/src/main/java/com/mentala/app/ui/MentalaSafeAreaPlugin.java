package com.mentala.app.ui;

import android.util.DisplayMetrics;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android bridge для safe area inset'ов + детерминированная edge-to-edge геометрия WebView.
 *
 * ИСТОРИЯ ПРОБЛЕМЫ. Раньше WebView лежал во весь экран (edge-to-edge, targetSdk 36 +
 * StatusBar.overlaysWebView), а отступ под системную навигацию снизу зависел от
 * ВНУТРЕННЕЙ автоматики Chromium WebView (M136+/M139+/M144+): WebView сам получает
 * WindowInsets и сам подстраивает вьюпорт. Эта автоматика гонко-зависима: если диспатч
 * инсетов теряется (запуск из Play Маркета через window-transition, системный
 * BiometricPrompt поверх Activity), WebView сохраняет «ghost»-состояние вьюпорта —
 * страница остаётся полной высоты и нижний bottom-nav обрезается системной навигацией.
 * Google прямо описывает этот класс багов и рекомендует «zeroing approach»:
 * https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets
 *
 * ТЕКУЩАЯ СХЕМА (детерминированная, без гонок):
 *  1. Нижний/боковые системные инсеты применяются НАТИВНО как layout-margin WebView.
 *     Это делает системный layout-проход — он самовосстанавливается при каждом
 *     dispatchApplyWindowInsets, и никакая гонка с BiometricPrompt/launch-transition
 *     не может оставить WebView в неправильной геометрии.
 *  2. Верхний инсет margin'ом НЕ применяется (WebView остаётся под статус-баром для
 *     эффекта overlaysWebView) — он, как и раньше, отдаётся в JS как CSS-переменная.
 *  3. Вниз по view-иерархии systemBars/displayCutout передаются ОБНУЛЁННЫМИ
 *     (WindowInsetsCompat.Builder + Insets.NONE), чтобы внутренняя автоматика WebView
 *     для системных баров никогда не включалась и не могла «протухнуть».
 *     IME-инсеты (клавиатура) передаются нетронутыми — ресайз вьюпорта под клавиатуру
 *     (Chromium M139+) продолжает работать как раньше.
 *
 * ВАЖНО: WindowInsets возвращает значения в физических пикселях, а CSS 1px = 1dp,
 * поэтому в JS значения конвертируются px → dp. Margin'ы ставятся в физических px.
 */
@CapacitorPlugin(name = "MentalaSafeArea")
public class MentalaSafeAreaPlugin extends Plugin {
    private static final String TAG = "MentalaSafeAreaPlugin";
    private static final float DEFAULT_DENSITY = 1f;

    private static final int SYSTEM_INSET_TYPES =
        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();

    private Insets currentInsets = Insets.NONE;

    @Override
    public void load() {
        super.load();
        attachInsetsListener();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        requestInsetsRefresh();
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        call.resolve(toJsObject(currentInsets));
    }

    /**
     * Форсирует свежий проход по WindowInsets и перелейаут WebView.
     * Margin-подход самовосстанавливается на каждом insets-диспатче, но метод
     * оставлен как belt-and-suspenders: JS дёргает его после разблокировки через
     * BiometricPrompt (который не вызывает onResume) и при возврате фокуса.
     */
    @PluginMethod
    public void refreshInsets(PluginCall call) {
        requestInsetsRefresh();
        call.resolve(toJsObject(currentInsets));
    }

    private void attachInsetsListener() {
        final View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            Log.w(TAG, "WebView is unavailable, cannot attach insets listener");
            return;
        }

        webView.post(() -> {
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
                final Insets nextInsets = windowInsets.getInsets(SYSTEM_INSET_TYPES);

                applyWebViewMargins(view, nextInsets);
                publishInsetsIfChanged(nextInsets);

                // «Zeroing approach» из официальной доки Android: системные инсеты
                // уже обработаны нативно (margin + CSS-переменная top), поэтому вниз
                // передаём их обнулёнными. Нотификация при этом продолжает доходить
                // до WebView (в отличие от CONSUMED), а IME-инсеты не трогаем —
                // ресайз под клавиатуру остаётся на автоматике WebView.
                return new WindowInsetsCompat.Builder(windowInsets)
                    .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.NONE)
                    .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                    .build();
            });

            requestInsetsRefresh();
        });
    }

    private void requestInsetsRefresh() {
        final View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            Log.w(TAG, "WebView is unavailable, cannot refresh insets");
            return;
        }

        // Единственный источник правды — insets-listener: он получает значения
        // ПОСЛЕ консьюма decor'ом (важно для Android ≤ 14, где окно само
        // подгоняется под навбар и сырые getRootWindowInsets дали бы двойной
        // отступ). requestApplyInsets гарантированно форсирует свежий диспатч
        // вниз по иерархии, даже если значения не менялись.
        webView.post(() -> ViewCompat.requestApplyInsets(webView));
    }

    /**
     * Применяет системные инсеты как физические margin'ы WebView: снизу и по бокам
     * (навигационная панель, вырезы). Сверху margin не ставим — WebView остаётся
     * под статус-баром (overlaysWebView), отступ сверху отдаётся через CSS.
     * Идемпотентно: layout-параметры обновляются только при реальном изменении.
     */
    private void applyWebViewMargins(@NonNull View webView, @NonNull Insets insets) {
        if (!(webView.getLayoutParams() instanceof ViewGroup.MarginLayoutParams)) {
            Log.w(TAG, "WebView layout params do not support margins");
            return;
        }

        final ViewGroup.MarginLayoutParams params =
            (ViewGroup.MarginLayoutParams) webView.getLayoutParams();

        if (
            params.bottomMargin == insets.bottom &&
            params.leftMargin == insets.left &&
            params.rightMargin == insets.right &&
            params.topMargin == 0
        ) {
            return;
        }

        params.bottomMargin = insets.bottom;
        params.leftMargin = insets.left;
        params.rightMargin = insets.right;
        params.topMargin = 0;
        webView.setLayoutParams(params);
    }

    private void publishInsetsIfChanged(@NonNull Insets nextInsets) {
        if (nextInsets.equals(currentInsets)) {
            return;
        }

        currentInsets = nextInsets;
        // Initial state клиент забирает через getInsets(), поэтому не держим
        // retained event до регистрации JS-listener'а: на холодном старте
        // Android WebView это может давать ранний Capacitor triggerEvent.
        notifyListeners("safeAreaChanged", toJsObject(nextInsets), false);
    }

    /**
     * В JS отдаём только top: низ и бока теперь обработаны нативными margin'ами,
     * поэтому для web-слоя их эффективное значение — 0. Если отдать реальные числа,
     * CSS добавит их повторно и получится двойной отступ (double-padding).
     */
    @NonNull
    private JSObject toJsObject(@NonNull Insets insets) {
        final float density = resolveDensity();
        final JSObject result = new JSObject();
        result.put("top", pxToDp(insets.top, density));
        result.put("right", 0);
        result.put("bottom", 0);
        result.put("left", 0);
        return result;
    }

    /**
     * Конвертирует физические пиксели WindowInsets в CSS-px (dp).
     * На устройствах с density 1.0 вернёт исходное значение без изменений.
     */
    private double pxToDp(int px, float density) {
        if (density <= 0f || !Float.isFinite(density)) return px;
        return px / (double) density;
    }

    private float resolveDensity() {
        try {
            final DisplayMetrics metrics =
                getContext().getResources().getDisplayMetrics();
            if (metrics != null && metrics.density > 0f
                && Float.isFinite(metrics.density)) {
                return metrics.density;
            }
        } catch (Throwable throwable) {
            Log.w(TAG, "Failed to read display density, falling back to 1.0", throwable);
        }
        return DEFAULT_DENSITY;
    }
}
