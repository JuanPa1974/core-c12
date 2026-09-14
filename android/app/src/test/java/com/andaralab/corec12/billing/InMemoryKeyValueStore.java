package com.andaralab.corec12.billing;

import java.util.HashMap;
import java.util.Map;

/** Test-only KeyValueStore — never shipped, plain JVM, no Android framework. */
final class InMemoryKeyValueStore implements KeyValueStore {

    private final Map<String, String> data = new HashMap<>();

    @Override
    public String get(String key) {
        return data.get(key);
    }

    @Override
    public void put(String key, String value) {
        data.put(key, value);
    }

    /** Test hook: simulate a corrupted/garbage value at a given key. */
    void putRaw(String key, String rawValue) {
        data.put(key, rawValue);
    }
}
