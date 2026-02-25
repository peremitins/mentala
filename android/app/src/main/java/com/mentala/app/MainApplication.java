package com.mentala.app;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import com.google.firebase.FirebaseApp;

public class MainApplication extends Application {
    private static final String TAG = "MainApplication";
    private static final String DEFAULT_CHANNEL_ID = "mentai_high";
    private static final String FALLBACK_CHANNEL_ID = "fcm_fallback_notification_channel";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureFirebaseInitialized();
        ensureNotificationChannel();
    }

    /**
     * Инициализируем Firebase корректным способом:
     * 1) Если подключён google-services.json, FirebaseInitProvider сам создаст [DEFAULT].
     * 2) Если по какой-либо причине провайдер не отработал, пытаемся вызвать initializeApp(this),
     *    который прочитает google-services.json.
     * 3) Если файла нет — НЕ инициализируем ничего "фейковыми" ключами и просто логируем предупреждение.
     *
     * Такое поведение предотвращает крэши PushNotificationsPlugin и избегает хардкода ключей в коде.
     */
    private void ensureFirebaseInitialized() {
        try {
            // Уже инициализирован (например, через FirebaseInitProvider)?
            if (!FirebaseApp.getApps(this).isEmpty()) {
                Log.d(TAG, "Firebase already initialized by provider");
                return;
            }

            // Пробуем инициализировать из google-services.json
            FirebaseApp app = FirebaseApp.initializeApp(this);
            if (app != null) {
                Log.d(TAG, "Firebase initialized from google-services.json");
            } else {
                // google-services.json отсутствует — пуши работать не будут, но приложение не должно падать
                Log.w(TAG, "Firebase not initialized: missing google-services.json. Push will be disabled.");
            }
        } catch (IllegalStateException e) {
            // Может быть гонка инициализации — считаем, что уже всё хорошо.
            Log.d(TAG, "Firebase was initialized concurrently: " + e.getMessage());
        } catch (Throwable t) {
            Log.e(TAG, "Failed to initialize Firebase safely: " + t.getMessage(), t);
        }
    }

    /**
     * Создаём канал уведомлений заранее, чтобы FCM не падал в fallback канал
     * (иначе Android может распределять уведомления в разные группы).
     */
    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        try {
            NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) {
                Log.w(TAG, "NotificationManager is null, cannot create channel");
                return;
            }

            NotificationChannel existing = manager.getNotificationChannel(DEFAULT_CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    DEFAULT_CHANNEL_ID,
                    "Mentala High Priority",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Важные уведомления Mentala");
                channel.enableLights(true);
                channel.enableVibration(true);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                manager.createNotificationChannel(channel);
                Log.d(TAG, "Notification channel created: " + DEFAULT_CHANNEL_ID);
            }

            // Удаляем fallback канал, если он был создан до появления корректного
            NotificationChannel fallback = manager.getNotificationChannel(FALLBACK_CHANNEL_ID);
            if (fallback != null) {
                manager.deleteNotificationChannel(FALLBACK_CHANNEL_ID);
                Log.d(TAG, "Deleted fallback notification channel");
            }
        } catch (Throwable t) {
            Log.e(TAG, "Failed to ensure notification channel: " + t.getMessage(), t);
        }
    }
}
