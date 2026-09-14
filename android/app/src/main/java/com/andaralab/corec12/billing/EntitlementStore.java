package com.andaralab.corec12.billing;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Native cache for the billing spike. Deliberately NOT JSON: org.json on
 * Android is a framework stub in plain JUnit tests (throws without
 * Robolectric), and this phase's instructions call for adding only the
 * Billing Library dependency — no extra test-only JSON library either. A
 * small set of flat, versioned KeyValueStore keys covers the fields this
 * spike actually needs and stays trivially testable with an in-memory
 * KeyValueStore.
 *
 * Separation of concerns (Fase 3 instructions): this class only persists
 * and reads back state — it never talks to BillingClient (BillingTransport)
 * and never decides what a purchase means (PurchaseProcessor). It is not a
 * secure vault: SharedPreferencesKeyValueStore is private app storage, same
 * protection level as the rest of the app, not hardware-backed — a rooted
 * device can edit it. It exists to survive process death / offline restarts,
 * not to resist a determined attacker (see PurchaseVerifier's header and
 * docs/architecture/ANDROID_BILLING_SPIKE.md).
 *
 * Confirmed Pro is sticky by design: nothing in this class ever clears
 * confirmed.isPro on a transient failure, on offline, or on a timer. It is
 * only ever set (on a real acknowledged, verified purchase) — clearing it
 * is out of scope for this spike (no refund/revocation handling yet).
 */
public final class EntitlementStore {

    private static final String SCHEMA = "v1";
    private static final String TOKEN_DELIMITER = "";

    private final KeyValueStore store;

    public EntitlementStore(KeyValueStore store) {
        this.store = store;
    }

    // ---- Confirmed entitlement ------------------------------------------------

    public static final class ConfirmedEntitlement {
        public final boolean isPro;
        public final String productId;
        public final String verifiedAt;

        ConfirmedEntitlement(boolean isPro, String productId, String verifiedAt) {
            this.isPro = isPro;
            this.productId = productId;
            this.verifiedAt = verifiedAt;
        }
    }

    public ConfirmedEntitlement getConfirmedEntitlement() {
        boolean isPro = "true".equals(store.get(key("confirmed.isPro")));
        String productId = store.get(key("confirmed.productId"));
        String verifiedAt = store.get(key("confirmed.verifiedAt"));
        return new ConfirmedEntitlement(isPro, productId, verifiedAt);
    }

    /** Only called after a purchase is verified AND successfully acknowledged. */
    public void setConfirmedEntitlement(String productId) {
        store.put(key("confirmed.isPro"), "true");
        store.put(key("confirmed.productId"), productId);
        store.put(key("confirmed.verifiedAt"), Instant.now().toString());
    }

    // ---- Pending acknowledgment -------------------------------------------------

    public static final class PendingAck {
        public final String purchaseToken;
        public final String productId;
        public final String firstSeenAt;
        public final int attempts;

        PendingAck(String purchaseToken, String productId, String firstSeenAt, int attempts) {
            this.purchaseToken = purchaseToken;
            this.productId = productId;
            this.firstSeenAt = firstSeenAt;
            this.attempts = attempts;
        }
    }

    public List<PendingAck> listPendingAcks() {
        List<PendingAck> result = new ArrayList<>();
        for (String token : readTokenList()) {
            String productId = store.get(key("pendingAck." + token + ".productId"));
            String firstSeenAt = store.get(key("pendingAck." + token + ".firstSeenAt"));
            int attempts = parseIntSafe(store.get(key("pendingAck." + token + ".attempts")), 0);
            // Corrupted entry (token listed but no productId survived) — skip it
            // rather than surface a broken record; never crash on a damaged cache.
            if (productId == null) continue;
            result.add(new PendingAck(token, productId, firstSeenAt, attempts));
        }
        return result;
    }

    /** Idempotent: calling it again for a token already pending just keeps the existing record. */
    public void addPendingAck(String purchaseToken, String productId) {
        List<String> tokens = readTokenList();
        if (!tokens.contains(purchaseToken)) {
            tokens.add(purchaseToken);
            writeTokenList(tokens);
            store.put(key("pendingAck." + purchaseToken + ".firstSeenAt"), Instant.now().toString());
            store.put(key("pendingAck." + purchaseToken + ".attempts"), "0");
        }
        store.put(key("pendingAck." + purchaseToken + ".productId"), productId);
    }

    public void incrementAckAttempts(String purchaseToken) {
        int current = parseIntSafe(store.get(key("pendingAck." + purchaseToken + ".attempts")), 0);
        store.put(key("pendingAck." + purchaseToken + ".attempts"), String.valueOf(current + 1));
    }

    public void removePendingAck(String purchaseToken) {
        List<String> tokens = readTokenList();
        if (tokens.remove(purchaseToken)) {
            writeTokenList(tokens);
        }
        // Leave the per-token fields in place (harmless orphans); they are
        // never read once the token is off the index list.
    }

    private List<String> readTokenList() {
        String joined = store.get(key("pendingAck.tokens"));
        List<String> tokens = new ArrayList<>();
        if (joined == null || joined.isEmpty()) return tokens;
        for (String t : joined.split(TOKEN_DELIMITER)) {
            if (!t.isEmpty()) tokens.add(t);
        }
        return tokens;
    }

    private void writeTokenList(List<String> tokens) {
        store.put(key("pendingAck.tokens"), String.join(TOKEN_DELIMITER, tokens));
    }

    // ---- Last query metadata (procedencia, para distinguir "sin Pro" de "no se pudo consultar") ----

    public void recordLastQuery(String source, String result) {
        store.put(key("lastQuery.at"), Instant.now().toString());
        store.put(key("lastQuery.source"), source);
        store.put(key("lastQuery.result"), result);
    }

    public static final class LastQuery {
        public final String at;
        public final String source;
        public final String result;

        LastQuery(String at, String source, String result) {
            this.at = at;
            this.source = source;
            this.result = result;
        }
    }

    public LastQuery getLastQuery() {
        return new LastQuery(store.get(key("lastQuery.at")), store.get(key("lastQuery.source")), store.get(key("lastQuery.result")));
    }

    // ---- helpers ----

    private static String key(String suffix) {
        return SCHEMA + "." + suffix;
    }

    private static int parseIntSafe(String value, int fallback) {
        if (value == null) return fallback;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback; // caché dañada: degradar, nunca lanzar
        }
    }
}
