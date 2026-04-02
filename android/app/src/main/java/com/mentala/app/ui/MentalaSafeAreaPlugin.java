package com.mentala.app.ui;

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
 */
@CapacitorPlugin(name = "MentalaSafeArea")
public class MentalaSafeAreaPlugin extends Plugin {
    private static final String TAG = "MentalaSafeAreaPlugin";

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
        notifyListeners("safeAreaChanged", toJsObject(nextInsets), true);
    }

    @NonNull
    private JSObject toJsObject(@NonNull Insets insets) {
        final JSObject result = new JSObject();
        result.put("top", insets.top);
        result.put("right", insets.right);
        result.put("bottom", insets.bottom);
        result.put("left", insets.left);
        return result;
    }
}
