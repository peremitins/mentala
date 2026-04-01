package com.mentala.app.realtime;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.mentala.app.MainActivity;
import com.mentala.app.R;

/**
 * Foreground service для realtime voice на Android.
 *
 * Сервис нужен как best-effort защита от suspend при заблокированном экране:
 * держит foreground-type для microphone/mediaPlayback и короткий PARTIAL_WAKE_LOCK,
 * пока активна realtime voice-сессия.
 */
public class MentalaRealtimeVoiceForegroundService extends Service {
    public static final String ACTION_START = "com.mentala.app.realtime.START";
    public static final String ACTION_STOP = "com.mentala.app.realtime.STOP";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";

    public static final String CHANNEL_ID = "mentala_realtime_voice";
    public static final int NOTIFICATION_ID = 3002;
    private static final long WAKE_LOCK_TIMEOUT_MS = 2L * 60L * 60L * 1000L;
    private static final String WAKE_LOCK_TAG =
        "com.mentala.app:realtime_voice_foreground";

    @Nullable
    private PowerManager.WakeLock wakeLock = null;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            releaseWakeLock();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        ensureChannel();
        acquireWakeLock();

        String title = getString(R.string.realtime_voice_fg_default_title);
        String subtitle = getString(R.string.realtime_voice_fg_default_subtitle);
        if (intent != null) {
            String titleExtra = intent.getStringExtra(EXTRA_TITLE);
            String subtitleExtra = intent.getStringExtra(EXTRA_SUBTITLE);
            if (titleExtra != null && !titleExtra.isEmpty()) {
                title = titleExtra;
            }
            if (subtitleExtra != null && !subtitleExtra.isEmpty()) {
                subtitle = subtitleExtra;
            }
        }

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setSmallIcon(R.drawable.ic_stat_mentala)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK |
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.realtime_voice_fg_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.realtime_voice_fg_channel_description));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            return;
        }

        PowerManager powerManager = getSystemService(PowerManager.class);
        if (powerManager == null) {
            return;
        }

        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            WAKE_LOCK_TAG
        );
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
    }

    private void releaseWakeLock() {
        if (wakeLock == null) {
            return;
        }

        if (wakeLock.isHeld()) {
            wakeLock.release();
        }

        wakeLock = null;
    }
}
