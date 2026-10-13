package com.geomatco.attendance;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * یادآوری «خروج ثبت نشده» حتی وقتی برنامه بسته است.
 * متن اعلان همان متن بنر داخل برنامه است و از صفحه می‌آید؛ اینجا فقط زمان‌بندی و نمایش است.
 */
public class ExitReminder extends BroadcastReceiver {

    static final String PREFS = "geoteam_exit_reminder";
    static final String CHANNEL = "exit_reminder";
    static final int NOTIFICATION_ID = 7101;
    // اعلان ماندگارِ «حضور» از لحظه ورود تا ثبت خروج؛ کانال جدا و بی‌صدا
    static final String CHANNEL_ONGOING = "presence";
    static final int ONGOING_ID = 7102;
    static final String ACTION_FIRE = "com.geomatco.attendance.EXIT_REMINDER";
    static final String ACTION_SNOOZE = "com.geomatco.attendance.EXIT_REMINDER_SNOOZE";
    static final String ACTION_TEST = "com.geomatco.attendance.EXIT_REMINDER_TEST";
    static final String EXTRA_APP_ACTION = "geoteam_action";
    static final long SNOOZE_MS = 30L * 60L * 1000L;

    static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    /** زمان‌بندی (یا جایگزینی) یادآوری ورود باز. key همان ورود است تا یک ورود دو بار اعلان ندهد. */
    static void schedule(Context ctx, String title, String body, long at, String key) {
        schedule(ctx, title, body, at, key, null, null);
    }

    /** همان، به‌علاوه اعلان ماندگارِ «حضور» که همین الان نشان داده می‌شود (ongoingTitle خالی = بدون آن) */
    static void schedule(Context ctx, String title, String body, long at, String key, String ongoingTitle, String ongoingBody) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (ongoingTitle != null && ongoingBody != null) {
            p.edit().putString("ongoingTitle", ongoingTitle).putString("ongoingBody", ongoingBody).apply();
            showOngoing(ctx, ongoingTitle, ongoingBody);
        }
        // همین ورود قبلاً اعلان شده و زمانش گذشته: دوباره نه (مگر «۳۰ دقیقه بعد»)
        if (key.equals(p.getString("fired", "")) && at <= System.currentTimeMillis() + 60000L) return;
        // زمان تازه در آینده (ورود تازه، یا ساعت یادآوری عوض شد): نشانه «اعلان شده» پاک شود،
        // وگرنه بعد از ری‌استارت گوشی restore() این یادآوری را نادیده می‌گرفت (یافته Antigravity، android #1)
        p.edit().putString("title", title).putString("body", body).putLong("at", at).putString("key", key).remove("fired").apply();
        setAlarm(ctx, at);
    }

    static void cancel(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(firePending(ctx));
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
        NotificationManagerCompat.from(ctx).cancel(ONGOING_ID);
    }

    /** بعد از ری‌استارت گوشی یا آپدیت برنامه، یادآوری ذخیره‌شده دوباره زمان‌بندی می‌شود. */
    static void restore(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String ongoingTitle = p.getString("ongoingTitle", null);
        String ongoingBody = p.getString("ongoingBody", null);
        if (ongoingTitle != null && ongoingBody != null) showOngoing(ctx, ongoingTitle, ongoingBody);
        long at = p.getLong("at", 0);
        if (at <= 0 || p.getString("key", "").equals(p.getString("fired", ""))) return;
        setAlarm(ctx, Math.max(at, System.currentTimeMillis() + 5000L));
    }

    private static PendingIntent firePending(Context ctx) {
        Intent i = new Intent(ctx, ExitReminder.class).setAction(ACTION_FIRE);
        return PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    private static void setAlarm(Context ctx, long at) {
        setAlarm(ctx, at, firePending(ctx));
    }

    // آلارم دقیق: آلارمِ «غیردقیق» در اندروید ۱۲ به بعد تا حدود ۷۵٪ فاصله تا زمانش عقب می‌افتد
    // (ورود ۸:۳۰ و یادآوری ۱۸:۰۰ ممکن بود ساعت ۱ بامداد برسد؛ گزارش مالک: «دسترسی خواست ولی کاری نکرد»)
    private static void setAlarm(Context ctx, long at, PendingIntent pi) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setWindow(AlarmManager.RTC_WAKEUP, at, 5L * 60L * 1000L, pi); // بدون مجوز: حداکثر ۵ دقیقه دیرتر
        } else if (Build.VERSION.SDK_INT >= 23) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /** اعلان آزمایشی ده ثانیه بعد، از همان مسیر آلارم (حتی اگر برنامه بسته شود) */
    static void scheduleTest(Context ctx) {
        Intent i = new Intent(ctx, ExitReminder.class).setAction(ACTION_TEST);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
        setAlarm(ctx, System.currentTimeMillis() + 10000L, pi);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (ACTION_SNOOZE.equals(action)) {
            NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
            long at = System.currentTimeMillis() + SNOOZE_MS;
            p.edit().putLong("at", at).remove("fired").apply();
            setAlarm(ctx, at);
            return;
        }
        if (ACTION_TEST.equals(action)) {
            show(ctx, "🔔 اعلان Geo Team کار می‌کند", "یادآوری خروج در ساعت تعیین‌شده همین‌طور می‌آید، حتی با برنامه بسته.");
            return;
        }
        if (!ACTION_FIRE.equals(action)) return;
        String title = p.getString("title", null);
        String body = p.getString("body", null);
        if (title == null) return; // ورود باز در این فاصله بسته شده
        p.edit().putString("fired", p.getString("key", "")).apply();
        show(ctx, title, body);
    }

    private static void show(Context ctx, String title, String body) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "یادآوری خروج", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("وقتی ورود ثبت شده ولی تا ساعت یادآوری خروج ثبت نشده");
            nm.createNotificationChannel(ch);
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_geoteam)
                .setLargeIcon(BitmapFactory.decodeResource(ctx.getResources(), R.drawable.ic_notification_large))
                .setColor(0xFFF3CB03)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(appAction(ctx, "open", 10))
                .addAction(0, "🔴 ثبت خروج", appAction(ctx, "exit", 11))
                .addAction(0, "⏰ ۳۰ دقیقه بعد", PendingIntent.getBroadcast(ctx, 12,
                        new Intent(ctx, ExitReminder.class).setAction(ACTION_SNOOZE), PendingIntent.FLAG_UPDATE_CURRENT | immutable()))
                .addAction(0, "✕", appAction(ctx, "dismiss", 13));
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException ignored) {
            // اجازه اعلان داده نشده؛ بنر داخل برنامه هنوز هست
        }
    }

    private static void showOngoing(Context ctx, String title, String body) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ONGOING) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ONGOING, "حضور فعال", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("از لحظه ثبت ورود تا ثبت خروج؛ با لمس آن خروج همین الان ثبت می‌شود");
            nm.createNotificationChannel(ch);
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ONGOING)
                .setSmallIcon(R.drawable.ic_stat_geoteam)
                .setColor(0xFFF3CB03)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setContentIntent(appAction(ctx, "open", 14))
                .addAction(0, "🔴 ثبت خروج", appAction(ctx, "exit", 15));
        try {
            NotificationManagerCompat.from(ctx).notify(ONGOING_ID, b.build());
        } catch (SecurityException ignored) {
            // اجازه اعلان داده نشده؛ بنر داخل برنامه هنوز هست
        }
    }

    private static PendingIntent appAction(Context ctx, String what, int req) {
        Intent i = new Intent(ctx, MainActivity.class)
                .putExtra(EXTRA_APP_ACTION, what)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }
}
