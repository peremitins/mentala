package com.mentala.app.realtime;

import android.media.AudioManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android bridge для realtime voice (OpenAI Realtime API через WebRTC).
 *
 * СТРАТЕГИЯ: realtime voice воспроизводится как ОБЫЧНОЕ МЕДИА (STREAM_MUSIC),
 * приложение остаётся в MODE_NORMAL.
 *
 * Почему НЕ MODE_IN_COMMUNICATION (важно, не возвращать назад):
 *
 *   Раньше плагин ставил MODE_IN_COMMUNICATION ради системного AEC. Но это —
 *   документированное поведение Android — насильно уводит обработку аппаратных
 *   клавиш громкости на STREAM_VOICE_CALL, тогда как WebRTC-аудио ассистента в
 *   WebView звучит на STREAM_MUSIC. setVolumeControlStream(STREAM_MUSIC) и ручной
 *   перехват клавиш система в communication-режиме игнорирует. Итог: громкость
 *   ассистента невозможно изменить боковыми клавишами (двигается «пустой» ползунок
 *   voice-call), а сам звук идёт тише обычного медиа. Поэтому communication-режим
 *   для нас неприемлем.
 *
 * Как лечим эхо/самозапись без системного AEC (как на iPhone):
 *
 *   1) Software AEC: getUserMedia запрашивается с echoCancellation/noiseSuppression
 *      (см. buildRealtimeVoiceAudioConstraints) — Chromium включает AEC3.
 *   2) Half-duplex: на время ответа ассистента микрофон глушится на JS-уровне
 *      (track.enabled = false, см. useRealtimeVoiceSession). Пока ассистент
 *      говорит — вход выключен, модель физически не может услышать саму себя.
 *      Именно отсутствие этого мьюта (он был только на iOS) ломало прошлую
 *      попытку media-режима: сервер слышал эхо и терял следующий user-turn.
 *
 * Что делает bridge в media-режиме:
 *   - Гарантирует MODE_NORMAL (на случай, если предыдущая сессия/компонент
 *     оставили communication-режим).
 *   - setVolumeControlStream(STREAM_MUSIC) — боковые клавиши всегда крутят медиа,
 *     даже в паузах между репликами. В MODE_NORMAL система это уважает.
 *   - Никакой ручной маршрутизации: STREAM_MUSIC система сама направляет в A2DP-
 *     наушники / проводные / основной динамик и переключает на горячее
 *     подключение. На основной динамик медиа идёт громко (не в earpiece).
 */
@CapacitorPlugin(name = "MentalaRealtimeVoiceAudio")
public class MentalaRealtimeVoiceAudioPlugin extends Plugin {
    private static final String TAG = "RealtimeVoiceAudio";

    @Nullable
    private Integer previousVolumeControlStream = null;

    @Nullable
    private Integer previousMode = null;

    private boolean isActive = false;

    // ============================================================
    // Capacitor entrypoints
    // ============================================================

    @PluginMethod
    public void activate(PluginCall call) {
        AppCompatActivity activity = getActivity();
        AudioManager audioManager = getAudioManager();

        if (activity == null || audioManager == null) {
            call.reject("Realtime voice audio bridge is unavailable");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                JSObject result = activateInternal(activity, audioManager);
                call.resolve(result);
            } catch (Throwable error) {
                Log.e(TAG, "Failed to activate realtime voice audio session", error);
                String errorMessage = error.getMessage();
                if (errorMessage == null || errorMessage.trim().isEmpty()) {
                    errorMessage = "Unexpected Android audio mode error";
                }
                call.reject(
                    "Failed to activate realtime voice audio session: " + errorMessage
                );
            }
        });
    }

    @PluginMethod
    public void deactivate(PluginCall call) {
        AppCompatActivity activity = getActivity();
        AudioManager audioManager = getAudioManager();

        if (activity == null || audioManager == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            restorePreviousAudioState(activity, audioManager);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        AppCompatActivity activity = getActivity();
        AudioManager audioManager = getAudioManager();
        if (activity == null || audioManager == null) {
            return;
        }

        activity.runOnUiThread(() -> restorePreviousAudioState(activity, audioManager));
    }

    // ============================================================
    // Активация (media-режим)
    // ============================================================

    private JSObject activateInternal(
        AppCompatActivity activity,
        AudioManager audioManager
    ) {
        boolean firstActivation = !isActive;
        if (firstActivation) {
            previousVolumeControlStream = activity.getVolumeControlStream();
            previousMode = audioManager.getMode();

            // Снимаем возможный communication-device pin от прошлых версий/сессий,
            // чтобы media-маршрут не остался прицеплен к SCO/earpiece. Делаем
            // только один раз: на каждом playback маршрут не трогаем.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    audioManager.clearCommunicationDevice();
                } catch (Throwable error) {
                    Log.w(TAG, "clearCommunicationDevice failed (ignored)", error);
                }
            }
        }

        // Идемпотентные ассершены — безопасны для повтора на старте каждого
        // ответа ассистента (JS re-activate). Они НЕ переключают audio route
        // (в отличие от старого comm-режима), поэтому не «съедают» первые слова:
        //   - MODE_NORMAL: если WebView заново перехватил режим — возвращаем media;
        //     если уже NORMAL — no-op.
        //   - setVolumeControlStream(STREAM_MUSIC): боковые клавиши всегда крутят
        //     медиа, даже в паузах. В MODE_NORMAL система это уважает.
        if (audioManager.getMode() != AudioManager.MODE_NORMAL) {
            audioManager.setMode(AudioManager.MODE_NORMAL);
        }
        activity.setVolumeControlStream(AudioManager.STREAM_MUSIC);

        isActive = true;

        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("mode", "media");
        result.put("volumeStream", "music");
        result.put("route", "system_media");
        result.put("speakerPinned", false);

        Log.i(
            TAG,
            "Realtime voice audio activated (media mode): musicVolume=" +
                audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) +
                "/" +
                audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        );
        return result;
    }

    // ============================================================
    // Восстановление
    // ============================================================

    private void restorePreviousAudioState(
        AppCompatActivity activity,
        AudioManager audioManager
    ) {
        if (
            !isActive &&
            previousVolumeControlStream == null &&
            previousMode == null
        ) {
            return;
        }

        if (previousMode != null && audioManager.getMode() != previousMode) {
            try {
                audioManager.setMode(previousMode);
            } catch (Throwable error) {
                Log.w(TAG, "Restore audio mode failed (ignored)", error);
            }
        }

        if (previousVolumeControlStream != null) {
            activity.setVolumeControlStream(previousVolumeControlStream);
        } else {
            activity.setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
        }

        isActive = false;
        previousVolumeControlStream = null;
        previousMode = null;

        Log.i(TAG, "Realtime voice audio state restored");
    }

    // ============================================================
    // Helpers
    // ============================================================

    @Nullable
    private AudioManager getAudioManager() {
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            return null;
        }
        return (AudioManager) activity.getSystemService(AppCompatActivity.AUDIO_SERVICE);
    }
}
