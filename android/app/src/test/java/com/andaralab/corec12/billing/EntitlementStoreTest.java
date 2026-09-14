package com.andaralab.corec12.billing;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class EntitlementStoreTest {

    @Test
    public void freshStore_hasNoConfirmedEntitlement() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        assertFalse(store.getConfirmedEntitlement().isPro);
    }

    @Test
    public void setConfirmedEntitlement_persistsIsProAndProductId() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        store.setConfirmedEntitlement("com.andaralab.corec12.pro");

        EntitlementStore.ConfirmedEntitlement confirmed = store.getConfirmedEntitlement();
        assertTrue(confirmed.isPro);
        assertEquals("com.andaralab.corec12.pro", confirmed.productId);
        assertNotNullOrEmpty(confirmed.verifiedAt);
    }

    @Test
    public void pendingAck_addListRemove() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        assertTrue(store.listPendingAcks().isEmpty());

        store.addPendingAck("tok-1", "com.andaralab.corec12.pro");
        List<EntitlementStore.PendingAck> pending = store.listPendingAcks();
        assertEquals(1, pending.size());
        assertEquals("tok-1", pending.get(0).purchaseToken);
        assertEquals(0, pending.get(0).attempts);

        store.incrementAckAttempts("tok-1");
        store.incrementAckAttempts("tok-1");
        assertEquals(2, store.listPendingAcks().get(0).attempts);

        store.removePendingAck("tok-1");
        assertTrue(store.listPendingAcks().isEmpty());
    }

    @Test
    public void addPendingAck_isIdempotent_forTheSameToken() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        store.addPendingAck("tok-1", "com.andaralab.corec12.pro");
        store.incrementAckAttempts("tok-1");
        store.addPendingAck("tok-1", "com.andaralab.corec12.pro"); // seen again (e.g. duplicate event)

        List<EntitlementStore.PendingAck> pending = store.listPendingAcks();
        assertEquals("re-adding the same token must not duplicate the entry", 1, pending.size());
        assertEquals("re-adding must not reset attempts already recorded", 1, pending.get(0).attempts);
    }

    @Test
    public void multiplePendingAcks_areTrackedIndependently() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        store.addPendingAck("tok-1", "com.andaralab.corec12.pro");
        store.addPendingAck("tok-2", "com.andaralab.corec12.pro");
        assertEquals(2, store.listPendingAcks().size());

        store.removePendingAck("tok-1");
        List<EntitlementStore.PendingAck> remaining = store.listPendingAcks();
        assertEquals(1, remaining.size());
        assertEquals("tok-2", remaining.get(0).purchaseToken);
    }

    @Test
    public void lastQuery_recordsSourceAndResult() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        assertNull(store.getLastQuery().at);

        store.recordLastQuery("resume", "OK");
        EntitlementStore.LastQuery lastQuery = store.getLastQuery();
        assertEquals("resume", lastQuery.source);
        assertEquals("OK", lastQuery.result);
        assertNotNullOrEmpty(lastQuery.at);
    }

    @Test
    public void corruptedAttemptsValue_degradesToZero_neverThrows() {
        InMemoryKeyValueStore raw = new InMemoryKeyValueStore();
        EntitlementStore store = new EntitlementStore(raw);
        store.addPendingAck("tok-1", "com.andaralab.corec12.pro");

        // Simulate a damaged cache: the attempts field is not a number.
        raw.putRaw("v1.pendingAck.tok-1.attempts", "not-a-number");

        List<EntitlementStore.PendingAck> pending = store.listPendingAcks();
        assertEquals(1, pending.size());
        assertEquals("corrupted attempts must degrade to 0, not throw", 0, pending.get(0).attempts);
    }

    @Test
    public void corruptedIsProFlag_neverGrantsPro() {
        InMemoryKeyValueStore raw = new InMemoryKeyValueStore();
        EntitlementStore store = new EntitlementStore(raw);

        raw.putRaw("v1.confirmed.isPro", "maybe"); // not literally "true"
        assertFalse("anything other than the literal \"true\" must read as not-Pro", store.getConfirmedEntitlement().isPro);
    }

    @Test
    public void pendingAckWithMissingProductId_isSkipped_notCrashed() {
        InMemoryKeyValueStore raw = new InMemoryKeyValueStore();
        EntitlementStore store = new EntitlementStore(raw);

        // Simulate a damaged cache: token indexed but its productId field never made it to disk.
        raw.putRaw("v1.pendingAck.tokens", "tok-broken");

        assertTrue("a pending-ack entry with no productId must be skipped, not surfaced broken", store.listPendingAcks().isEmpty());
    }

    private static void assertNotNullOrEmpty(String value) {
        assertTrue(value != null && !value.isEmpty());
    }
}
