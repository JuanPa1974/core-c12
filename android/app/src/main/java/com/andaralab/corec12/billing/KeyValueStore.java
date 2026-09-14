package com.andaralab.corec12.billing;

/**
 * Minimal persistence seam. android.content.SharedPreferences is a
 * framework stub in plain JUnit tests (no Robolectric here); EntitlementStore
 * is built against this interface instead so its logic is testable on a
 * plain JVM with an in-memory implementation. SharedPreferencesKeyValueStore
 * is the only real, on-device implementation.
 */
public interface KeyValueStore {
    String get(String key);
    void put(String key, String value);
}
