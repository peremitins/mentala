package com.mentala.app.ui;

import android.util.DisplayMetrics;
import android.util.Log;
import android.view.View;

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
 * Android bridge для реальных safe area inset'ов.
 *
 * На части Android WebView, особенно на больших экранах и edge-to-edge режимах,
 * CSS env(safe-area-inset-*) может приходить как 0px. Поэтому берём WindowInsets
 * напрямую из native-слоя и отдаём их в JS.
 *
 * ВАЖНО: WindowInsets возвращает значения в физических пикселях, а CSS 1px = 1dp.
 * Без деления на density получим гигантский отступ на hi-DPI устройствах
 * (Pixel 8 Pro, любой телефон с density > 1). Поэтому здесь конвертируем
 * pixels → dp (CSS-px) перед отдачей в JS.
 */
@CapacitorPlugin(name = "MentalaSafeArea")
public class MentalaSafeAreaPlugin extends Plugin {
    private static final String TAG = "MentalaSafeAreaPlugin";
    private static final float DEFAULT_DENSITY = 1f;

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
     *
     * Нужен для случаев, когда инсеты/высота вьюпорта «протухли» без
     * полноценного onResume — например после системного BiometricPrompt,
     * который показывается внутри той же Activity и не запускает
     * handleOnResume(). Делает то же, что рабочий resume-путь:
     * перечитывает rootWindowInsets и вызывает requestApplyInsets().
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
                final Insets nextInsets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                );
                publishInsetsIfChanged(nextInsets);

                // Возвращаем исходные inset'ы, чтобы WebView не терял системную информацию.
                return windowInsets;
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

        webView.post(() -> {
            final WindowInsetsCompat rootInsets = ViewCompat.getRootWindowInsets(webView);
            if (rootInsets != null) {
                final Insets nextInsets = rootInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                );
                publishInsetsIfChanged(nextInsets);
            }

            ViewCompat.requestApplyInsets(webView);
        });
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

    @NonNull
    private JSObject toJsObject(@NonNull Insets insets) {
        final float density = resolveDensity();
        final JSObject result = new JSObject();
        result.put("top", pxToDp(insets.top, density));
        result.put("right", pxToDp(insets.right, density));
        result.put("bottom", pxToDp(insets.bottom, density));
        result.put("left", pxToDp(insets.left, density));
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
