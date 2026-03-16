package com.mentala.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.text.TextUtils;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class MentalaMessagingService extends FirebaseMessagingService {
    private static final String TAG = "MentalaMessaging";
    private static final String CHANNEL_ID = "mentai_high";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        // Прокидываем токен в Capacitor, чтобы JS-слой мог его зарегистрировать.
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        // Всегда прокидываем событие в Capacitor, чтобы JS-слой мог
        // обновить UI/аналитику независимо от состояния приложения.
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        // Системное уведомление строим сами и в фоне, и в фореграунде.
        // Так сохраняем единый tap/deeplink flow через contentIntent.

        Map<String, String> data = remoteMessage.getData();
        String title = data.get("title");
        String body = data.get("body");

        if ((TextUtils.isEmpty(title) || TextUtils.isEmpty(body))
            && remoteMessage.getNotification() != null) {
            if (TextUtils.isEmpty(title)) {
                title = remoteMessage.getNotification().getTitle();
            }
            if (TextUtils.isEmpty(body)) {
                body = remoteMessage.getNotification().getBody();
            }
        }

        if (TextUtils.isEmpty(title) && TextUtils.isEmpty(body)) {
            Log.w(TAG, "Skip notification without title/body");
            return;
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        // Важно: Capacitor PushNotificationsPlugin ждёт google.message_id,
        // чтобы эмитить pushNotificationActionPerformed при тапе.
        String messageId = remoteMessage.getMessageId();
        if (TextUtils.isEmpty(messageId)) {
            messageId = data.get("google.message_id");
        }
        if (TextUtils.isEmpty(messageId)) {
            messageId = data.get("slotId");
        }
        if (TextUtils.isEmpty(messageId)) {
            messageId = String.valueOf(System.currentTimeMillis());
        }
        intent.putExtra("google.message_id", messageId);

        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }

        int requestCode = buildRequestCode(messageId, data.get("slotId"));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            flags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(pendingIntent);

        if (!TextUtils.isEmpty(body)) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        String imageUrl = data.get("image");
        if (!TextUtils.isEmpty(imageUrl)) {
            Bitmap bitmap = fetchBitmap(imageUrl);
            if (bitmap != null) {
                builder.setStyle(
                    new NotificationCompat.BigPictureStyle()
                        .bigPicture(bitmap)
                );
                builder.setLargeIcon(bitmap);
            }
        }

        // На некоторых устройствах стиль может перезаписать контент;
        // фиксируем contentIntent повторно, чтобы клик работал и в раскрытом виде.
        builder.setContentIntent(pendingIntent);

        Log.d(TAG, "Show notification: messageId=" + messageId + ", slotId=" + data.get("slotId"));

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            Log.w(TAG, "NotificationManager is null, cannot show notification");
            return;
        }

        String slotId = data.get("slotId");
        int notificationId = Math.abs(requestCode);
        if (!TextUtils.isEmpty(slotId)) {
            manager.notify("slot-" + slotId, notificationId, builder.build());
        } else {
            manager.notify(notificationId, builder.build());
        }
    }

    private int buildRequestCode(String messageId, String slotId) {
        String source = !TextUtils.isEmpty(slotId) ? slotId : messageId;
        if (TextUtils.isEmpty(source)) {
            return (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        }
        return Math.abs(source.hashCode());
    }

    private Bitmap fetchBitmap(String imageUrl) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(imageUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setInstanceFollowRedirects(true);
            connection.connect();
            try (InputStream stream = connection.getInputStream()) {
                return BitmapFactory.decodeStream(stream);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Failed to load notification image: " + t.getMessage());
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
