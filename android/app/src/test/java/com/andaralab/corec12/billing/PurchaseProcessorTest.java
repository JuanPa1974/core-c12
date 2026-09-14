package com.andaralab.corec12.billing;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PurchaseProcessorTest {

    private static final String PRODUCT_ID = "com.andaralab.corec12.pro";
    private final SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
    private final Base64Codec base64 = java.util.Base64.getDecoder()::decode; // plain JDK, test-only

    private PurchaseEvidence purchased(String token, boolean acknowledged) {
        String json = "{\"productId\":\"" + PRODUCT_ID + "\",\"purchaseToken\":\"" + token + "\"}";
        byte[] sig = kp.sign(json);
        return new PurchaseEvidence(
            PRODUCT_ID,
            token,
            json,
            java.util.Base64.getEncoder().encodeToString(sig),
            PurchaseEvidence.State.PURCHASED,
            acknowledged,
            1234L
        );
    }

    private PurchaseEvidence tamperedPurchased(String token) {
        PurchaseEvidence real = purchased(token, false);
        String tamperedJson = "{\"productId\":\"" + PRODUCT_ID + "\",\"purchaseToken\":\"other-token\"}";
        return new PurchaseEvidence(PRODUCT_ID, token, tamperedJson, real.signatureBase64, PurchaseEvidence.State.PURCHASED, false, 1234L);
    }

    // ---- classify() ----

    @Test
    public void pending_classifiesAsPending() {
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        PurchaseEvidence evidence = new PurchaseEvidence(PRODUCT_ID, "tok", "{}", "", PurchaseEvidence.State.PENDING, false, 1L);

        assertEquals(PurchaseProcessor.Classification.PENDING, processor.classify(evidence));
    }

    @Test
    public void wrongProduct_classifiesAsProductMismatch() {
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        PurchaseEvidence evidence = purchased("tok", false);
        PurchaseEvidence wrongProduct = new PurchaseEvidence(
            "com.andaralab.other.product",
            evidence.purchaseToken,
            evidence.originalJson,
            evidence.signatureBase64,
            PurchaseEvidence.State.PURCHASED,
            false,
            1L
        );

        assertEquals(PurchaseProcessor.Classification.PRODUCT_MISMATCH, processor.classify(wrongProduct));
    }

    @Test
    public void purchasedAndValidAndUnacknowledged_classifiesAsNeedsAck() {
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        assertEquals(PurchaseProcessor.Classification.NEEDS_ACK, processor.classify(purchased("tok", false)));
    }

    @Test
    public void purchasedAndValidAndAcknowledged_classifiesAsAlreadyAcknowledged() {
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        assertEquals(PurchaseProcessor.Classification.ALREADY_ACKNOWLEDGED, processor.classify(purchased("tok", true)));
    }

    @Test
    public void purchasedWithTamperedData_classifiesAsVerificationFailed() {
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        assertEquals(PurchaseProcessor.Classification.VERIFICATION_FAILED, processor.classify(tamperedPurchased("tok")));
    }

    @Test
    public void purchasedWithNoVerificationKeyConfigured_classifiesAsConfigIncomplete() {
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(null), base64, PRODUCT_ID);
        assertEquals(PurchaseProcessor.Classification.CONFIG_INCOMPLETE, processor.classify(purchased("tok", false)));
    }

    @Test
    public void configIncomplete_isNotTheSameAsVerificationFailed() {
        // Regression guard for the Fase 3 §8/§11 requirement: these must never collapse into one.
        PurchaseProcessor incompleteConfig = new PurchaseProcessor(new PurchaseVerifier(null), base64, PRODUCT_ID);
        PurchaseProcessor realVerifier = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);

        assertEquals(PurchaseProcessor.Classification.CONFIG_INCOMPLETE, incompleteConfig.classify(purchased("tok", false)));
        assertEquals(PurchaseProcessor.Classification.VERIFICATION_FAILED, realVerifier.classify(tamperedPurchased("tok")));
    }

    // ---- applyToStore() ----

    @Test
    public void applyToStore_needsAck_addsPendingAck_neverGrantsPro() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        PurchaseEvidence evidence = purchased("tok", false);

        processor.applyToStore(store, PurchaseProcessor.Classification.NEEDS_ACK, evidence);

        assertFalse(store.getConfirmedEntitlement().isPro);
        assertEquals(1, store.listPendingAcks().size());
    }

    @Test
    public void applyToStore_alreadyAcknowledged_confirmsProAndClearsPendingAck() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        PurchaseEvidence evidence = purchased("tok", true);
        store.addPendingAck(evidence.purchaseToken, PRODUCT_ID); // as if a previous NEEDS_ACK pass had seen it

        processor.applyToStore(store, PurchaseProcessor.Classification.ALREADY_ACKNOWLEDGED, evidence);

        assertTrue(store.getConfirmedEntitlement().isPro);
        assertTrue(store.listPendingAcks().isEmpty());
    }

    @Test
    public void applyToStore_verificationFailed_neverMutatesStore() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);

        processor.applyToStore(store, PurchaseProcessor.Classification.VERIFICATION_FAILED, tamperedPurchased("tok"));

        assertFalse(store.getConfirmedEntitlement().isPro);
        assertTrue(store.listPendingAcks().isEmpty());
    }

    @Test
    public void applyToStore_configIncomplete_neverMutatesStore() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(null), base64, PRODUCT_ID);

        processor.applyToStore(store, PurchaseProcessor.Classification.CONFIG_INCOMPLETE, purchased("tok", false));

        assertFalse(store.getConfirmedEntitlement().isPro);
        assertTrue(store.listPendingAcks().isEmpty());
    }

    @Test
    public void applyToStore_pending_neverMutatesStore() {
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        PurchaseEvidence evidence = new PurchaseEvidence(PRODUCT_ID, "tok", "{}", "", PurchaseEvidence.State.PENDING, false, 1L);

        processor.applyToStore(store, PurchaseProcessor.Classification.PENDING, evidence);

        assertFalse(store.getConfirmedEntitlement().isPro);
        assertTrue(store.listPendingAcks().isEmpty());
    }
}
