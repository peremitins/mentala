package com.mentala.app;

import android.content.Intent;
import android.util.Log;
import android.os.Bundle;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import com.mentala.app.audio.MentalaAudioForegroundPlugin;
import com.mentala.app.realtime.MentalaRealtimeVoiceAudioPlugin;
import com.mentala.app.realtime.MentalaRealtimeVoiceForegroundPlugin;
import com.mentala.app.ui.MentalaSafeAreaPlugin;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import org.json.JSONObject;

import java.util.Set;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
  private static final String PUSH_STORAGE_FILE = "CapacitorStorage";
  private static final String PUSH_LAUNCH_KEY = "mentai.push.launchPayload";
  private static final String[] PUSH_SIGNAL_KEYS = new String[] {
      "google.message_id",
      "deepLink",
      "navigation",
      "navType",
      "navId",
      "action",
      "trackId",
      "practiceId",
      "slotId"
  };

  private boolean hasPushSignal(Bundle extras) {
    if (extras == null) return false;
    for (String key : PUSH_SIGNAL_KEYS) {
      if (extras.containsKey(key)) return true;
    }
    return false;
  }

  private void persistPushLaunchPayload(Intent intent) {
    if (intent == null) return;
    final Bundle extras = intent.getExtras();
    if (extras == null || !hasPushSignal(extras)) return;

    try {
      final JSONObject payload = new JSONObject();
      final Set<String> keys = extras.keySet();
      for (String key : keys) {
        final Object value = extras.get(key);
        if (value == null) continue;
        payload.put(key, String.valueOf(value));
      }
      payload.put("createdAt", System.currentTimeMillis());

      final SharedPreferences prefs =
          getSharedPreferences(PUSH_STORAGE_FILE, Context.MODE_PRIVATE);
      prefs.edit().putString(PUSH_LAUNCH_KEY, payload.toString()).apply();

      Log.d("MainActivity", "Persisted push launch payload: " + payload.toString());
    } catch (Throwable throwable) {
      Log.w("MainActivity", "Failed to persist push launch payload", throwable);
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (intent != null
        && intent.getExtras() != null
        && intent.getExtras().containsKey("google.message_id")) {
      Log.d("MainActivity", "Push intent received: " + intent.getExtras().keySet());
    }
    persistPushLaunchPayload(intent);
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Локальные Capacitor plugins должны регистрироваться до super.onCreate(),
    // иначе Bridge создастся без их PluginHeaders и JS увидит
    // "plugin is not implemented on android".
    registerPlugin(MentalaAudioForegroundPlugin.class);
    registerPlugin(MentalaRealtimeVoiceAudioPlugin.class);
    registerPlugin(MentalaRealtimeVoiceForegroundPlugin.class);
    registerPlugin(MentalaSafeAreaPlugin.class);
    super.onCreate(savedInstanceState);
    persistPushLaunchPayload(getIntent());
  }

  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    if (MentalaRealtimeVoiceAudioPlugin.handleHardwareVolumeKey(this, event)) {
      return true;
    }

    return super.dispatchKeyEvent(event);
  }

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
        && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
      PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
      if (pluginHandle == null) {
        Log.i("Google Activity Result", "SocialLogin plugin handle is null");
        return;
      }
      Plugin plugin = pluginHandle.getInstance();
      if (!(plugin instanceof SocialLoginPlugin)) {
        Log.i("Google Activity Result", "SocialLogin plugin instance is invalid");
        return;
      }
      ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
    }
  }

  @Override
  public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
    // Required by the SocialLogin plugin.
  }
}
