package com.andaralab.corec12.billing;

/**
 * Seam for delayed callbacks (purchase-flow timeout, bounded ack retries)
 * so CoreC12BillingManager doesn't depend on android.os.Handler directly —
 * tests use a fake that lets them fire a scheduled Runnable on demand
 * (deterministic "resultado tardío" / timeout tests, no real sleeping).
 */
public interface Scheduler {
    void postDelayed(Runnable action, long delayMillis);
    void cancel(Runnable action);
}
