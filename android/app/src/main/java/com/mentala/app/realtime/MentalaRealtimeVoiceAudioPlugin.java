package com.mentala.app.realtime;

import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
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
 * Минимальный Android bridge только для realtime voice.
 *
 * Задача bridge: сохранить MODE_IN_COMMUNICATION для WebRTC-микрофона,
 * но жёстко зафиксировать communication route на основном динамике.
 *
 * В прошлой версии мы переводили приложение в MODE_NORMAL ради speaker/media
 * поведения. По логам это давало правильный output route, но после первого
 * assistant ответа OpenAI переставал стабильно слышать следующий user-turn.
 * Для двустороннего realtime-а безопаснее оставаться в communication mode
 * и управлять communication device отдельно от playback-громкости.
 *
 * Практический нюанс текущего WebView/WebRTC: микрофон живёт в
 * MODE_IN_COMMUNICATION, но удалённый assistant playback приходит как
 * USAGE_MEDIA. Поэтому громкость нужно вести через STREAM_MUSIC, иначе
 * пользователь крутит call volume, а loudness assistant-а не меняется.
 */
@CapacitorPlugin(name = "MentalaRealtimeVoiceAudio")
public class MentalaRealtimeVoiceAudioPlugin extends Plugin {
    private static final String TAG = "RealtimeVoiceAudio";

    @Nullable
    private Integer previousVolumeControlStream = null;

    @Nullable
    private Boolean previousSpeakerphoneState = null;

    private boolean isActive = false;
    private static volatile boolean realtimeVoiceSessionActive = false;

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
                Log.e(TAG, "Failed to activate realtime voice media mode", error);
                String errorMessage = error.getMessage();
                if (errorMessage == null || errorMessage.trim().isEmpty()) {
                    errorMessage = "Unexpected Android audio mode error";
                }
                call.reject(
                    "Failed to activate realtime voice media mode: " + errorMessage
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

    private JSObject activateInternal(
        AppCompatActivity activity,
        AudioManager audioManager
    ) {
        if (!isActive) {
            previousVolumeControlStream = activity.getVolumeControlStream();
            previousSpeakerphoneState = audioManager.isSpeakerphoneOn();
        }

        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        pinCommunicationRouteToSpeaker(audioManager);
        activity.setVolumeControlStream(AudioManager.STREAM_MUSIC);

        isActive = true;
        realtimeVoiceSessionActive = true;

        JSObject result = new JSObject();
        result.put("mode", "communication");
        result.put("volumeStream", "music");
        result.put("speakerPinned", isSpeakerRoutePinned(audioManager));

        Log.i(
            TAG,
            "Realtime voice communication mode activated, speakerPinned=" +
                isSpeakerRoutePinned(audioManager) +
                ", musicVolume=" +
                audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) +
                ", voiceCallVolume=" +
                audioManager.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
        );
        return result;
    }

    private void restorePreviousAudioState(
        AppCompatActivity activity,
        AudioManager audioManager
    ) {
        if (
            !isActive &&
            previousVolumeControlStream == null &&
            previousSpeakerphoneState == null
        ) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.clearCommunicationDevice();
        } else if (previousSpeakerphoneState != null) {
            audioManager.setSpeakerphoneOn(previousSpeakerphoneState);
        } else {
            audioManager.setSpeakerphoneOn(false);
        }

        audioManager.setMode(AudioManager.MODE_NORMAL);

        if (previousVolumeControlStream != null) {
            activity.setVolumeControlStream(previousVolumeControlStream);
        } else {
            activity.setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
        }

        isActive = false;
        realtimeVoiceSessionActive = false;
        previousVolumeControlStream = null;
        previousSpeakerphoneState = null;

        Log.i(TAG, "Realtime voice communication audio state restored");
    }

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
                audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) +
                ", voiceCallVolume=" +
                audioManager.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
        );
        return true;
    }

    private void pinCommunicationRouteToSpeaker(AudioManager audioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
                if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                    audioManager.setCommunicationDevice(device);
                    return;
                }
            }
        }

        audioManager.setSpeakerphoneOn(true);
    }

    private boolean isSpeakerRoutePinned(AudioManager audioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo communicationDevice = audioManager.getCommunicationDevice();
            return communicationDevice != null &&
                communicationDevice.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
        }

        return audioManager.isSpeakerphoneOn();
    }

    @Nullable
    private AudioManager getAudioManager() {
        if (getContext() == null) {
            return null;
        }

        return (AudioManager) getContext().getSystemService(getContext().AUDIO_SERVICE);
    }
}
