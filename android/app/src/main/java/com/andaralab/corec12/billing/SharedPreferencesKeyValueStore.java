package com.andaralab.corec12.billing;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Real, on-device KeyValueStore. Private app storage (MODE_PRIVATE) — the
 * same protection level as the rest of the app's preferences; not a
 * hardware-backed vault (see EntitlementStore's header on cache limits).
 */
public final class SharedPreferencesKeyValueStore implements KeyValueStore {

    private static final String PREFS_NAME = "core_c12_billing_spike";

    private final SharedPreferences prefs;

    public SharedPreferencesKeyValueStore(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @Override
    public String get(String key) {
        return prefs.getString(key, null);
    }

    @Override
    public void put(String key, String value) {
        prefs.edit().putString(key, value).apply();
    }
}
