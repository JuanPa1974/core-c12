package com.andaralab.corec12.billing;

import java.util.ArrayList;
import java.util.List;

/**
 * Test-only Scheduler: nothing runs automatically or after a real delay.
 * Tests decide exactly when a scheduled Runnable fires — this is what
 * makes "resultado tardío" / timeout / bounded-retry scenarios
 * deterministic instead of sleep-based.
 */
final class FakeScheduler implements Scheduler {

    static final class Scheduled {
        final Runnable action;
        final long delayMillis;

        Scheduled(Runnable action, long delayMillis) {
            this.action = action;
            this.delayMillis = delayMillis;
        }
    }

    private final List<Scheduled> pending = new ArrayList<>();

    @Override
    public void postDelayed(Runnable action, long delayMillis) {
        pending.add(new Scheduled(action, delayMillis));
    }

    @Override
    public void cancel(Runnable action) {
        pending.removeIf(s -> s.action == action);
    }

    int pendingCount() {
        return pending.size();
    }

    /** Fires the oldest still-pending Runnable, as if its delay had elapsed. */
    void fireNext() {
        if (pending.isEmpty()) throw new IllegalStateException("no scheduled action to fire");
        Scheduled next = pending.remove(0);
        next.action.run();
    }

    /** Fires every currently-pending Runnable, oldest first — including any newly (re)scheduled by an earlier one. */
    void fireAll() {
        while (!pending.isEmpty()) {
            fireNext();
        }
    }
}
