package com.mentala.app.realtime;

import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge для foreground-сервиса realtime voice.
 */
@CapacitorPlugin(name = "MentalaRealtimeVoiceForeground")
public class MentalaRealtimeVoiceForegroundPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        if (getContext() == null) {
            call.reject("Context is unavailable");
            return;
        }

        String title = call.getString("title");
        String subtitle = call.getString("subtitle");

        Intent intent = new Intent(
            getContext(),
            MentalaRealtimeVoiceForegroundService.class
        );
        intent.setAction(MentalaRealtimeVoiceForegroundService.ACTION_START);
        if (title != null) {
            intent.putExtra(MentalaRealtimeVoiceForegroundService.EXTRA_TITLE, title);
        }
        if (subtitle != null) {
            intent.putExtra(MentalaRealtimeVoiceForegroundService.EXTRA_SUBTITLE, subtitle);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }

        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (getContext() == null) {
            call.reject("Context is unavailable");
            return;
        }

        Intent stopIntent = new Intent(
            getContext(),
            MentalaRealtimeVoiceForegroundService.class
        );
        stopIntent.setAction(MentalaRealtimeVoiceForegroundService.ACTION_STOP);
        getContext().startService(stopIntent);

        call.resolve();
    }
}
