package com.geomatco.attendance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** بعد از ری‌استارت گوشی یا آپدیت برنامه، یادآوری خروجِ ذخیره‌شده دوباره زمان‌بندی می‌شود. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            ExitReminder.restore(ctx);
        }
    }
}
