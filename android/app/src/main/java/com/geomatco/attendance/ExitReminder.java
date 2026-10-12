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
    static final String ACTION_FIRE = "com.geomatco.attendance.EXIT_REMINDER";
    static final String ACTION_SNOOZE = "com.geomatco.attendance.EXIT_REMINDER_SNOOZE";
    static final String EXTRA_APP_ACTION = "geoteam_action";
    static final long SNOOZE_MS = 30L * 60L * 1000L;

    static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    /** زمان‌بندی (یا جایگزینی) یادآوری ورود باز. key همان ورود است تا یک ورود دو بار اعلان ندهد. */
    static void schedule(Context ctx, String title, String body, long at, String key) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // همین ورود قبلاً اعلان شده و زمانش گذشته: دوباره نه (مگر «۳۰ دقیقه بعد»)
        if (key.equals(p.getString("fired", "")) && at <= System.currentTimeMillis() + 60000L) return;
        p.edit().putString("title", title).putString("body", body).putLong("at", at).putString("key", key).apply();
        setAlarm(ctx, at);
    }

    static void cancel(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(firePending(ctx));
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
    }

    /** بعد از ری‌استارت گوشی یا آپدیت برنامه، یادآوری ذخیره‌شده دوباره زمان‌بندی می‌شود. */
    static void restore(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long at = p.getLong("at", 0);
        if (at <= 0 || p.getString("key", "").equals(p.getString("fired", ""))) return;
        setAlarm(ctx, Math.max(at, System.currentTimeMillis() + 5000L));
    }

    private static PendingIntent firePending(Context ctx) {
        Intent i = new Intent(ctx, ExitReminder.class).setAction(ACTION_FIRE);
        return PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    private static void setAlarm(Context ctx, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = firePending(ctx);
        // دقیق‌بودن تا حد چند دقیقه کافی است؛ مجوز «آلارم دقیق» لازم نیست
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.set(AlarmManager.RTC_WAKEUP, at, pi);
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

    private static PendingIntent appAction(Context ctx, String what, int req) {
        Intent i = new Intent(ctx, MainActivity.class)
                .putExtra(EXTRA_APP_ACTION, what)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }
}
