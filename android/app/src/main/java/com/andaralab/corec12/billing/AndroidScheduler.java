package com.andaralab.corec12.billing;

import android.os.Handler;
import android.os.Looper;

/** Real, on-device Scheduler on the main looper. */
public final class AndroidScheduler implements Scheduler {

    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void postDelayed(Runnable action, long delayMillis) {
        handler.postDelayed(action, delayMillis);
    }

    @Override
    public void cancel(Runnable action) {
        handler.removeCallbacks(action);
    }
}
