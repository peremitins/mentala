package com.mentala.app.realtime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;

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
 * Главная задача — корректный аудио-роутинг во время сессии.
 *
 * Ключевые принципы (см. .docs/arch_chat_memory.md и комментарии ниже):
 *
 * 1) Режим аудио всегда MODE_IN_COMMUNICATION. Только в этом режиме система
 *    включает AEC/AGC/NS на тракте микрофона. Без этого микрофон ловит речь
 *    ассистента из динамика, OpenAI начинает транскрибировать собственные
 *    ответы как реплики пользователя — старый баг с дублированием. Менять
 *    режим в MODE_NORMAL ради качественного звука нельзя.
 *
 * 2) Маршрут НЕ пинится к built-in speaker насильно. Вместо этого выбираем
 *    communication device по приоритету:
 *      LE_AUDIO/HEARING_AID > BT_SCO > WIRED/USB headset > BUILTIN_SPEAKER
 *    Так на Android (как и на iOS) звук идёт в подключённые наушники, а в
 *    их отсутствие — на основной динамик (а не на earpiece, к которому
 *    Android по умолчанию роутит communication-режим).
 *
 * 3) Список устройств отслеживается реактивно через AudioDeviceCallback —
 *    подключение/отключение наушников ВО ВРЕМЯ сессии переключает маршрут
 *    автоматически.
 *
 * 4) Громкость — STREAM_MUSIC. WebRTC playback приходит как USAGE_MEDIA,
 *    значит хардверные клавиши громкости должны крутить именно music stream,
 *    иначе пользователь меняет громкость voice-call, а ассистент не тише.
 */
@CapacitorPlugin(name = "MentalaRealtimeVoiceAudio")
public class MentalaRealtimeVoiceAudioPlugin extends Plugin {
    private static final String TAG = "RealtimeVoiceAudio";

    /** Таймаут установки SCO-соединения для legacy ветки (Xiaomi/OPPO иногда не присылают callback). */
    private static final long SCO_CONNECT_TIMEOUT_MS = 4000L;

    @Nullable
    private Integer previousVolumeControlStream = null;

    @Nullable
    private Boolean previousSpeakerphoneState = null;

    @Nullable
    private Integer previousMode = null;

    private boolean isActive = false;
    private static volatile boolean realtimeVoiceSessionActive = false;

    @Nullable
    private AudioDeviceCallback deviceCallback = null;

    @Nullable
    private BroadcastReceiver scoStateReceiver = null;

    @Nullable
    private Runnable scoTimeoutRunnable = null;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

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
    // Активация
    // ============================================================

    private JSObject activateInternal(
        AppCompatActivity activity,
        AudioManager audioManager
    ) {
        if (!isActive) {
            previousVolumeControlStream = activity.getVolumeControlStream();
            previousSpeakerphoneState = audioManager.isSpeakerphoneOn();
            previousMode = audioManager.getMode();
        }

        // 1) Обязательно communication mode — только так система включит AEC/NS/AGC.
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

        // 2) Хардварные клавиши громкости -> music stream (см. doc-комментарий класса).
        activity.setVolumeControlStream(AudioManager.STREAM_MUSIC);

        // 3) Подписываемся на горячее подключение/отключение наушников до того,
        //    как примем первый routing-decision: если устройство дернётся прямо
        //    в момент активации, callback всё равно сработает и переприменит
        //    маршрут.
        registerDeviceCallback(audioManager);

        // 4) Legacy SCO state нужен только на API < 31, на новых API маршрутизация
        //    идёт через setCommunicationDevice без таймеров.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            registerScoStateReceiver(audioManager);
        }

        // 5) Применяем маршрут.
        AppliedRoute applied = applyPreferredRoute(audioManager);

        isActive = true;
        realtimeVoiceSessionActive = true;

        JSObject result = new JSObject();
        result.put("mode", "communication");
        result.put("volumeStream", "music");
        result.put("route", applied.label);
        result.put("speakerPinned", applied.isBuiltinSpeaker);

        Log.i(
            TAG,
            "Realtime voice audio activated: route=" + applied.label +
                ", deviceType=" + applied.deviceType +
                ", musicVolume=" + audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) +
                ", voiceCallVolume=" + audioManager.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
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
            previousSpeakerphoneState == null &&
            previousMode == null
        ) {
            return;
        }

        cancelScoTimeout();
        unregisterScoStateReceiver();
        unregisterDeviceCallback(audioManager);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                audioManager.clearCommunicationDevice();
            } catch (Throwable error) {
                Log.w(TAG, "clearCommunicationDevice failed", error);
            }
        } else {
            // Legacy: гасим SCO и speakerphone в исходное состояние.
            try {
                if (audioManager.isBluetoothScoOn()) {
                    audioManager.setBluetoothScoOn(false);
                }
                audioManager.stopBluetoothSco();
            } catch (Throwable error) {
                Log.w(TAG, "stopBluetoothSco failed", error);
            }
            if (previousSpeakerphoneState != null) {
                audioManager.setSpeakerphoneOn(previousSpeakerphoneState);
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
        }

        // Mode восстанавливаем последним: некоторые OEM сбрасывают communication
        // device при смене mode, поэтому сначала чистим устройство, потом mode.
        audioManager.setMode(
            previousMode != null ? previousMode : AudioManager.MODE_NORMAL
        );

        if (previousVolumeControlStream != null) {
            activity.setVolumeControlStream(previousVolumeControlStream);
        } else {
            activity.setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
        }

        isActive = false;
        realtimeVoiceSessionActive = false;
        previousVolumeControlStream = null;
        previousSpeakerphoneState = null;
        previousMode = null;

        Log.i(TAG, "Realtime voice audio state restored");
    }

    // ============================================================
    // Routing
    // ============================================================

    private AppliedRoute applyPreferredRoute(AudioManager audioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return applyModernRoute(audioManager);
        }
        return applyLegacyRoute(audioManager);
    }

    /**
     * Android 12+ (API 31+): официальный API для communication-роутинга.
     * Перебираем availableCommunicationDevices от высшего приоритета к низшему,
     * первый успешный setCommunicationDevice() выигрывает.
     */
    private AppliedRoute applyModernRoute(AudioManager audioManager) {
        AudioDeviceInfo[] candidates;
        try {
            // getAvailableCommunicationDevices возвращает только то, к чему можно
            // прицепить communication-маршрут (BT SCO / wired / USB / speaker /
            // earpiece). A2DP-наушники без микрофона сюда НЕ попадают — это ОК,
            // для двустороннего голоса всё равно нужен SCO/BLE с микрофоном.
            candidates = audioManager.getAvailableCommunicationDevices().toArray(new AudioDeviceInfo[0]);
        } catch (Throwable error) {
            Log.w(TAG, "getAvailableCommunicationDevices failed", error);
            candidates = new AudioDeviceInfo[0];
        }

        AudioDeviceInfo best = pickBestByPriority(candidates);
        if (best != null) {
            try {
                boolean ok = audioManager.setCommunicationDevice(best);
                if (ok) {
                    return new AppliedRoute(
                        labelFor(best.getType()),
                        best.getType(),
                        best.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    );
                }
                Log.w(TAG, "setCommunicationDevice returned false for type=" + best.getType());
            } catch (Throwable error) {
                Log.w(TAG, "setCommunicationDevice threw for type=" + best.getType(), error);
            }
        }

        // Fallback: попробовать каждое доступное устройство по очереди (если
        // первое не приняло — может быть транзиентная ошибка).
        for (AudioDeviceInfo device : candidates) {
            if (device == best) continue;
            try {
                if (audioManager.setCommunicationDevice(device)) {
                    return new AppliedRoute(
                        labelFor(device.getType()),
                        device.getType(),
                        device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    );
                }
            } catch (Throwable ignored) {
            }
        }

        // Совсем крайний случай: ни одно устройство не приняло вызов.
        // Это означает, что система сама уже выбрала маршрут — отдадим то,
        // что вернёт getCommunicationDevice().
        try {
            AudioDeviceInfo current = audioManager.getCommunicationDevice();
            if (current != null) {
                return new AppliedRoute(
                    labelFor(current.getType()),
                    current.getType(),
                    current.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                );
            }
        } catch (Throwable ignored) {
        }

        return new AppliedRoute("unknown", -1, false);
    }

    /**
     * Android 8-11 (API 26-30): legacy API.
     *  - Если есть BT SCO headset → startBluetoothSco + setBluetoothScoOn(true).
     *  - Если есть проводные/USB наушники → speakerphoneOn=false, SCO выкл (система
     *    в communication mode сама направит звук в проводной выход).
     *  - Иначе → speakerphoneOn=true, чтобы communication mode не ушёл в earpiece.
     */
    private AppliedRoute applyLegacyRoute(AudioManager audioManager) {
        AudioDeviceInfo[] outputs;
        try {
            outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        } catch (Throwable error) {
            Log.w(TAG, "getDevices failed", error);
            outputs = new AudioDeviceInfo[0];
        }

        boolean hasBtSco = false;
        boolean hasWiredOrUsb = false;
        int chosenType = AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;

        for (AudioDeviceInfo device : outputs) {
            int type = device.getType();
            if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
                hasBtSco = true;
            } else if (
                type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                type == AudioDeviceInfo.TYPE_USB_HEADSET ||
                type == AudioDeviceInfo.TYPE_USB_DEVICE
            ) {
                hasWiredOrUsb = true;
                if (chosenType == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                    chosenType = type;
                }
            }
        }

        // BT SCO имеет высший приоритет (как и на API 31+).
        if (hasBtSco) {
            try {
                audioManager.setSpeakerphoneOn(false);
                if (audioManager.isBluetoothScoAvailableOffCall()) {
                    audioManager.setBluetoothScoOn(true);
                    audioManager.startBluetoothSco();
                    scheduleScoTimeoutFallback(audioManager);
                    return new AppliedRoute("bluetooth_sco", AudioDeviceInfo.TYPE_BLUETOOTH_SCO, false);
                }
                Log.w(TAG, "BT SCO is not available off-call, falling through");
            } catch (Throwable error) {
                Log.w(TAG, "Failed to start BT SCO, falling through", error);
            }
        }

        // Проводные/USB: в communication mode Android сам направит вывод
        // в проводной интерфейс, если speakerphone выключен.
        if (hasWiredOrUsb) {
            try {
                if (audioManager.isBluetoothScoOn()) {
                    audioManager.setBluetoothScoOn(false);
                }
                audioManager.stopBluetoothSco();
            } catch (Throwable ignored) {
            }
            audioManager.setSpeakerphoneOn(false);
            return new AppliedRoute(labelFor(chosenType), chosenType, false);
        }

        // Без наушников: пин на основной динамик, чтобы communication mode не
        // отправил звук в earpiece (как раз поведение, которое ловил старый код).
        try {
            if (audioManager.isBluetoothScoOn()) {
                audioManager.setBluetoothScoOn(false);
            }
            audioManager.stopBluetoothSco();
        } catch (Throwable ignored) {
        }
        audioManager.setSpeakerphoneOn(true);
        return new AppliedRoute("builtin_speaker", AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, true);
    }

    @Nullable
    private AudioDeviceInfo pickBestByPriority(AudioDeviceInfo[] devices) {
        AudioDeviceInfo best = null;
        int bestPriority = Integer.MAX_VALUE;
        for (AudioDeviceInfo device : devices) {
            int p = priorityFor(device.getType());
            if (p < bestPriority) {
                bestPriority = p;
                best = device;
            }
        }
        return best;
    }

    /**
     * Меньше = выше приоритет. Порядок: LE Audio / hearing aid > BT SCO >
     * wired/USB headset > built-in speaker > earpiece (последний — нежелателен,
     * но допустим как самый-самый крайний фолбэк).
     */
    private int priorityFor(int type) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (type == AudioDeviceInfo.TYPE_BLE_HEADSET) return 0;
            if (type == AudioDeviceInfo.TYPE_BLE_SPEAKER) return 1;
        }
        if (type == AudioDeviceInfo.TYPE_HEARING_AID) return 0;
        if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return 2;
        if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET) return 3;
        if (type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES) return 3;
        if (type == AudioDeviceInfo.TYPE_USB_HEADSET) return 4;
        if (type == AudioDeviceInfo.TYPE_USB_DEVICE) return 5;
        if (type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return 10;
        if (type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return 99;
        return 50;
    }

    private String labelFor(int type) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (type == AudioDeviceInfo.TYPE_BLE_HEADSET) return "ble_headset";
            if (type == AudioDeviceInfo.TYPE_BLE_SPEAKER) return "ble_speaker";
        }
        switch (type) {
            case AudioDeviceInfo.TYPE_HEARING_AID: return "hearing_aid";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: return "bluetooth_sco";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return "wired_headset";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES: return "wired_headphones";
            case AudioDeviceInfo.TYPE_USB_HEADSET: return "usb_headset";
            case AudioDeviceInfo.TYPE_USB_DEVICE: return "usb_device";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "builtin_speaker";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "builtin_earpiece";
            default: return "type_" + type;
        }
    }

    // ============================================================
    // AudioDeviceCallback (горячее переключение наушников)
    // ============================================================

    private void registerDeviceCallback(AudioManager audioManager) {
        if (deviceCallback != null) return;

        deviceCallback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                if (!isActive) return;
                Log.i(TAG, "Audio devices added: " + describeDevices(addedDevices));
                applyPreferredRoute(audioManager);
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                if (!isActive) return;
                Log.i(TAG, "Audio devices removed: " + describeDevices(removedDevices));
                applyPreferredRoute(audioManager);
            }
        };

        try {
            audioManager.registerAudioDeviceCallback(deviceCallback, mainHandler);
        } catch (Throwable error) {
            Log.w(TAG, "registerAudioDeviceCallback failed", error);
            deviceCallback = null;
        }
    }

    private void unregisterDeviceCallback(AudioManager audioManager) {
        if (deviceCallback == null) return;
        try {
            audioManager.unregisterAudioDeviceCallback(deviceCallback);
        } catch (Throwable error) {
            Log.w(TAG, "unregisterAudioDeviceCallback failed", error);
        }
        deviceCallback = null;
    }

    private String describeDevices(AudioDeviceInfo[] devices) {
        if (devices == null || devices.length == 0) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < devices.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append(labelFor(devices[i].getType()));
        }
        sb.append("]");
        return sb.toString();
    }

    // ============================================================
    // Legacy SCO (API < 31)
    // ============================================================

    private void registerScoStateReceiver(AudioManager audioManager) {
        if (scoStateReceiver != null) return;

        scoStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                int state = intent.getIntExtra(
                    AudioManager.EXTRA_SCO_AUDIO_STATE,
                    AudioManager.SCO_AUDIO_STATE_ERROR
                );
                Log.i(TAG, "SCO state changed: " + state);
                if (state == AudioManager.SCO_AUDIO_STATE_CONNECTED) {
                    cancelScoTimeout();
                    audioManager.setBluetoothScoOn(true);
                } else if (
                    state == AudioManager.SCO_AUDIO_STATE_DISCONNECTED ||
                    state == AudioManager.SCO_AUDIO_STATE_ERROR
                ) {
                    cancelScoTimeout();
                    if (isActive) {
                        // SCO отвалился — перевыберем маршрут, скорее всего уйдём
                        // на проводные или speaker.
                        applyPreferredRoute(audioManager);
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED);
        try {
            // На API 26+ можно регистрировать без флагов; RECEIVER_NOT_EXPORTED
            // на API 33+ — system audio broadcast, мы только слушаем.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(
                    scoStateReceiver,
                    filter,
                    Context.RECEIVER_NOT_EXPORTED
                );
            } else {
                getContext().registerReceiver(scoStateReceiver, filter);
            }
        } catch (Throwable error) {
            Log.w(TAG, "registerReceiver(SCO) failed", error);
            scoStateReceiver = null;
        }
    }

    private void unregisterScoStateReceiver() {
        if (scoStateReceiver == null) return;
        try {
            getContext().unregisterReceiver(scoStateReceiver);
        } catch (Throwable error) {
            Log.w(TAG, "unregisterReceiver(SCO) failed", error);
        }
        scoStateReceiver = null;
    }

    private void scheduleScoTimeoutFallback(AudioManager audioManager) {
        cancelScoTimeout();
        scoTimeoutRunnable = () -> {
            if (!isActive) return;
            Log.w(TAG, "SCO connect timeout, falling back to non-BT route");
            try {
                audioManager.stopBluetoothSco();
                audioManager.setBluetoothScoOn(false);
            } catch (Throwable ignored) {
            }
            // Применим маршрут заново — теперь без BT SCO в кандидатах
            // выберется проводное / speaker.
            applyPreferredRoute(audioManager);
        };
        mainHandler.postDelayed(scoTimeoutRunnable, SCO_CONNECT_TIMEOUT_MS);
    }

    private void cancelScoTimeout() {
        if (scoTimeoutRunnable != null) {
            mainHandler.removeCallbacks(scoTimeoutRunnable);
            scoTimeoutRunnable = null;
        }
    }

    // ============================================================
    // Hardware volume keys (вызывается из MainActivity.dispatchKeyEvent)
    // ============================================================

    public static boolean handleHardwareVolumeKey(
        AppCompatActivity activity,
        KeyEvent event
    ) {
        if (!realtimeVoiceSessionActive || activity == null || event == null) {
            return false;
        }

        if (event.getAction() != KeyEvent.ACTION_DOWN) {
            return false;
        }

        int keyCode = event.getKeyCode();
        AudioManager audioManager =
            (AudioManager) activity.getSystemService(AppCompatActivity.AUDIO_SERVICE);
        if (audioManager == null) {
            return false;
        }

        final int direction;
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            direction = AudioManager.ADJUST_RAISE;
        } else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            direction = AudioManager.ADJUST_LOWER;
        } else {
            return false;
        }

        audioManager.adjustStreamVolume(
            AudioManager.STREAM_MUSIC,
            direction,
            AudioManager.FLAG_SHOW_UI
        );

        Log.i(
            TAG,
            "Realtime voice hardware volume key handled, keyCode=" +
                keyCode +
                ", musicVolume=" +
                audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        );
        return true;
    }

    // ============================================================
    // Helpers
    // ============================================================

    @Nullable
    private AudioManager getAudioManager() {
        Context context = getContext();
        if (context == null) {
            return null;
        }
        return (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }

    /** Результат выбора маршрута для логов и JS-ответа. */
    private static final class AppliedRoute {
        final String label;
        final int deviceType;
        final boolean isBuiltinSpeaker;

        AppliedRoute(String label, int deviceType, boolean isBuiltinSpeaker) {
            this.label = label;
            this.deviceType = deviceType;
            this.isBuiltinSpeaker = isBuiltinSpeaker;
        }
    }
}
