package com.andaralab.corec12.billing;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * Exercises CoreC12BillingManager end-to-end against FakeBillingTransport +
 * FakeScheduler — no real BillingClient, no real clock, no Android
 * framework. Covers the Fase 3 §12 scenarios that need the manager's
 * orchestration (lifecycle, async acknowledgment/retry, duplicate/late
 * events, concurrency guard) — classification/verification edge cases live
 * in PurchaseProcessorTest/PurchaseVerifierTest instead.
 */
public class CoreC12BillingManagerTest {

    private static final String PRODUCT_ID = "com.andaralab.corec12.pro";
    private final SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
    private final Base64Codec base64 = java.util.Base64.getDecoder()::decode;

    private PurchaseEvidence purchasedEvidence(String token, boolean acknowledged) {
        String json = "{\"productId\":\"" + PRODUCT_ID + "\",\"purchaseToken\":\"" + token + "\"}";
        byte[] sig = kp.sign(json);
        return new PurchaseEvidence(
            PRODUCT_ID,
            token,
            json,
            java.util.Base64.getEncoder().encodeToString(sig),
            PurchaseEvidence.State.PURCHASED,
            acknowledged,
            1L
        );
    }

    private PurchaseEvidence pendingEvidence(String token) {
        return new PurchaseEvidence(PRODUCT_ID, token, "{}", "", PurchaseEvidence.State.PENDING, false, 1L);
    }

    private CoreC12BillingManager buildManager(FakeBillingTransport transport, EntitlementStore store, FakeScheduler scheduler) {
        PurchaseProcessor processor = new PurchaseProcessor(new PurchaseVerifier(kp.publicKeyDerBytes()), base64, PRODUCT_ID);
        return new CoreC12BillingManager(transport, processor, store, scheduler, PRODUCT_ID);
    }

    private static ProductOffer offer() {
        return new ProductOffer(PRODUCT_ID, "Core C12 Pro", "Desbloquea todo", "$4.99", "offer-token", new Object());
    }

    // ---- PENDING ----

    @Test
    public void purchase_pendingResult_resolvesPending_noAcknowledgeAttempted() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        FakeScheduler scheduler = new FakeScheduler();
        CoreC12BillingManager manager = buildManager(transport, store, scheduler);
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(pendingEvidence("tok-pending")));

        assertEquals(1, results.size());
        assertEquals(BridgeStatus.PENDING, results.get(0).status);
        assertFalse(results.get(0).isPro);
        assertEquals("PENDING must never attempt acknowledgment", 0, transport.acknowledgeCallCount);
    }

    // ---- PURCHASED verificado y reconocido ----

    @Test
    public void purchase_needsAck_acknowledgeSucceeds_endsInProConfirmed() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        FakeScheduler scheduler = new FakeScheduler();
        CoreC12BillingManager manager = buildManager(transport, store, scheduler);
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(purchasedEvidence("tok-1", false)));

        assertEquals(1, results.size());
        assertEquals(BridgeStatus.PRO_CONFIRMED, results.get(0).status);
        assertTrue(results.get(0).isPro);
        assertTrue(store.getConfirmedEntitlement().isPro);
        assertTrue(store.listPendingAcks().isEmpty());
        assertEquals(Collections.singletonList("tok-1"), transport.acknowledgedTokensInOrder);
    }

    // ---- Compra ya reconocida ----

    @Test
    public void purchase_alreadyAcknowledged_isProConfirmedImmediately_withoutCallingAcknowledgeAgain() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(purchasedEvidence("tok-1", true)));

        assertEquals(BridgeStatus.PRO_CONFIRMED, results.get(0).status);
        assertEquals("isAcknowledged()==true must never trigger a second acknowledgePurchase call", 0, transport.acknowledgeCallCount);
    }

    // ---- Acknowledgment fallido y reintentado ----

    @Test
    public void acknowledge_failsThenSucceedsOnRetry_grantsProOnlyAfterSuccess() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        transport.ackOutcomes.add(false); // first attempt fails
        transport.ackOutcomes.add(true); // retry succeeds
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        FakeScheduler scheduler = new FakeScheduler();
        CoreC12BillingManager manager = buildManager(transport, store, scheduler);
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(purchasedEvidence("tok-1", false)));

        // The purchase() call itself already resolved with the "purchase-update" pass result,
        // taken before the ack retry completes — ack is fire-and-forget from the manager's
        // perspective once NEEDS_ACK is seen (Fase 3 §9: ACK_PENDING is its own state).
        assertEquals(1, results.size());
        assertEquals(BridgeStatus.ACK_PENDING, results.get(0).status);
        assertFalse("must not be Pro before acknowledgment actually succeeds", store.getConfirmedEntitlement().isPro);
        assertEquals(1, transport.acknowledgeCallCount);
        assertEquals(1, store.listPendingAcks().get(0).attempts);

        // Drive the scheduled retry.
        assertEquals(1, scheduler.pendingCount());
        scheduler.fireNext();

        assertEquals(2, transport.acknowledgeCallCount);
        assertTrue("Pro must be granted once the retried acknowledgment succeeds", store.getConfirmedEntitlement().isPro);
        assertTrue(store.listPendingAcks().isEmpty());
    }

    @Test
    public void acknowledge_exhaustsRetries_neverGrantsPro_tokenStaysPendingForNextRecovery() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        for (int i = 0; i < 5; i++) transport.ackOutcomes.add(false); // always fails
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        FakeScheduler scheduler = new FakeScheduler();
        CoreC12BillingManager manager = buildManager(transport, store, scheduler);
        manager.start();

        manager.purchase(null, r -> {});
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(purchasedEvidence("tok-1", false)));

        // Drain every scheduled retry within this session.
        while (scheduler.pendingCount() > 0) {
            scheduler.fireNext();
        }

        assertFalse(store.getConfirmedEntitlement().isPro);
        assertEquals("the token must remain pending for recovery on the next connect/resume, never dropped", 1, store.listPendingAcks().size());
        assertTrue("acknowledgment must never be marked complete after exhausting retries", store.listPendingAcks().get(0).attempts >= 1);
    }

    // ---- Callback duplicado / eventos tras un resultado tardío ----

    @Test
    public void duplicateUpdateEvent_doesNotResolveCallbackTwice() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);
        PurchaseEvidence evidence = purchasedEvidence("tok-1", true);
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(evidence));
        // A second, duplicate delivery of the exact same update (Play can redeliver).
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(evidence));

        assertEquals("the bridge call must be resolved exactly once", 1, results.size());
        assertTrue(store.getConfirmedEntitlement().isPro); // state itself stays correct either way (idempotent)
    }

    @Test
    public void lateUpdateAfterTimeout_stillUpdatesEntitlementAndFiresEvent_withoutReResolvingTheCall() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        FakeScheduler scheduler = new FakeScheduler();
        CoreC12BillingManager manager = buildManager(transport, store, scheduler);
        List<Boolean> entitlementChangedFired = new ArrayList<>();
        manager.setEntitlementChangedListener(() -> entitlementChangedFired.add(true));
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);

        // Simulate the purchase-result timeout firing before any real update arrives.
        assertEquals(1, scheduler.pendingCount());
        scheduler.fireNext();
        assertEquals(1, results.size());
        assertEquals(BridgeStatus.QUERY_FAILED, results.get(0).status);

        // The real update now arrives late, already acknowledged (e.g. Play resolved it after all).
        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(purchasedEvidence("tok-1", true)));

        assertEquals("a late event must never resolve the call a second time", 1, results.size());
        assertTrue("but store state must still reflect the late, legitimate result", store.getConfirmedEntitlement().isPro);
        assertTrue("entitlementChanged must still fire for a late-but-real confirmation", entitlementChangedFired.contains(true));
    }

    // ---- Cancelación ----

    @Test
    public void purchase_userCancelled_resolvesCancelled_notAnError() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);
        transport.capturedListener().onUserCancelled();

        assertEquals(BridgeStatus.CANCELLED, results.get(0).status);
        assertFalse(results.get(0).isPro);
    }

    // ---- ITEM_ALREADY_OWNED -> reconciliación ----

    @Test
    public void itemAlreadyOwned_triggersReconciliationQuery_andConfirmsProWhenFound() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        // The reconciliation query (triggered by ITEM_ALREADY_OWNED) will find the existing, already-acknowledged purchase.
        transport.queryPurchasesResult = Collections.singletonList(purchasedEvidence("tok-existing", true));

        List<BridgeResult> results = new ArrayList<>();
        manager.purchase(null, results::add);
        transport.capturedListener().onError("ITEM_ALREADY_OWNED");

        assertEquals(1, results.size());
        assertEquals(BridgeStatus.PRO_CONFIRMED, results.get(0).status);
        assertTrue(store.getConfirmedEntitlement().isPro);
    }

    // ---- Prevención de flujos de compra simultáneos ----

    @Test
    public void concurrentPurchaseCalls_secondIsRejectedImmediately_launchIsOnlyAttemptedOnce() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        List<BridgeResult> first = new ArrayList<>();
        List<BridgeResult> second = new ArrayList<>();
        manager.purchase(null, first::add);
        manager.purchase(null, second::add); // fired while the first is still in flight

        assertTrue(first.isEmpty());
        assertEquals(1, second.size());
        assertEquals(BridgeStatus.PURCHASE_IN_PROGRESS, second.get(0).status);
        assertEquals("only the first call may actually reach launchPurchase", 1, transport.launchPurchaseCallCount);

        transport.capturedListener().onPurchasesUpdated(Collections.singletonList(purchasedEvidence("tok-1", true)));
        assertEquals(1, first.size());
        assertEquals(BridgeStatus.PRO_CONFIRMED, first.get(0).status);
    }

    // ---- Restore con compra / sin compra ----

    @Test
    public void restore_withOwnedPurchase_confirmsPro() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.queryPurchasesResult = Collections.singletonList(purchasedEvidence("tok-1", true));
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.restorePurchases(results::add);

        assertEquals(BridgeStatus.PRO_CONFIRMED, results.get(0).status);
        assertTrue(results.get(0).isPro);
    }

    @Test
    public void restore_withNoPurchases_resolvesNone_notAnError() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.queryPurchasesResult = Collections.emptyList();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.restorePurchases(results::add);

        assertEquals(BridgeStatus.NONE, results.get(0).status);
        assertFalse(results.get(0).isPro);
    }

    // ---- Error de restore conservando entitlement previo ----

    @Test
    public void restore_queryFails_preservesPreviouslyConfirmedPro_neverReportsSuccess() {
        FakeBillingTransport transport = new FakeBillingTransport();
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        store.setConfirmedEntitlement(PRODUCT_ID); // Pro already confirmed from an earlier session
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        transport.queryPurchasesQueryFailed = true;
        transport.queryPurchasesFailureReason = "SERVICE_DISCONNECTED";

        List<BridgeResult> results = new ArrayList<>();
        manager.restorePurchases(results::add);

        assertEquals(BridgeStatus.QUERY_FAILED, results.get(0).status);
        assertTrue("a failed query must never look like success, but must not drop a known Pro entitlement either", results.get(0).isPro);
        assertTrue(store.getConfirmedEntitlement().isPro);
    }

    // ---- Offline con y sin entitlement confirmado ----

    @Test
    public void offline_withNoConfirmedEntitlement_getEntitlementReportsNone_purchaseReportsBillingUnavailable() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.connectSucceeds = false;
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start(); // connect fails silently, matching production (no user-facing error just from a background reconcile attempt)

        List<BridgeResult> entitlementResults = new ArrayList<>();
        manager.getEntitlement(entitlementResults::add);
        assertEquals(BridgeStatus.NONE, entitlementResults.get(0).status);
        assertFalse(entitlementResults.get(0).isPro);

        List<BridgeResult> purchaseResults = new ArrayList<>();
        manager.purchase(null, purchaseResults::add);
        assertEquals(BridgeStatus.BILLING_UNAVAILABLE, purchaseResults.get(0).status);
    }

    @Test
    public void offline_withConfirmedEntitlement_getEntitlementStillReportsProFromCache() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.connectSucceeds = false;
        EntitlementStore store = new EntitlementStore(new InMemoryKeyValueStore());
        store.setConfirmedEntitlement(PRODUCT_ID); // confirmed in an earlier, connected session
        CoreC12BillingManager manager = buildManager(transport, store, new FakeScheduler());
        manager.start();

        List<BridgeResult> results = new ArrayList<>();
        manager.getEntitlement(results::add);

        assertEquals(BridgeStatus.PRO_CONFIRMED, results.get(0).status);
        assertTrue("a transient/offline failure must never silently take away a cached Pro entitlement", results.get(0).isPro);
    }

    // ---- Compra recuperada por consulta tras "reinicio" ----

    @Test
    public void purchaseRecoveredOnNextStart_viaSharedStore_acrossFreshManagerInstance() {
        EntitlementStore sharedStore = new EntitlementStore(new InMemoryKeyValueStore());

        // Session 1: a purchase is made but the process dies before acknowledgment lands
        // (e.g. no callback ever reached the app) — only the pending-ack bookkeeping survives.
        FakeBillingTransport transport1 = new FakeBillingTransport();
        transport1.productOfferToReturn = offer();
        transport1.ackOutcomes.add(false); // the one acknowledge attempt this session fails — bookkeeping survives, Pro does not
        CoreC12BillingManager manager1 = buildManager(transport1, sharedStore, new FakeScheduler());
        manager1.start();
        manager1.purchase(null, r -> {});
        transport1.capturedListener().onPurchasesUpdated(Collections.singletonList(purchasedEvidence("tok-1", false)));
        // The process "dies" here — no further retries fire in this session (scheduler is never driven again).
        assertFalse(sharedStore.getConfirmedEntitlement().isPro);
        assertEquals(1, sharedStore.listPendingAcks().size());

        // Session 2 ("app restarted"): a brand new manager/transport, same on-disk store.
        // Play now reports the purchase as already acknowledged (acknowledgment DID land server-side).
        FakeBillingTransport transport2 = new FakeBillingTransport();
        transport2.queryPurchasesResult = Collections.singletonList(purchasedEvidence("tok-1", true));
        CoreC12BillingManager manager2 = buildManager(transport2, sharedStore, new FakeScheduler());
        manager2.start(); // start() reconciles via queryPurchases — this is the recovery path

        assertTrue("a purchase pending ack in a previous session must be recovered on the next start()", sharedStore.getConfirmedEntitlement().isPro);
        assertTrue(sharedStore.listPendingAcks().isEmpty());
    }

    // ---- getProduct: producto no configurado en Play Console todavía ----

    @Test
    public void getProduct_whenPlayReturnsNoProduct_reportsUnavailable_withoutInventingAPrice() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = null;
        transport.productFailureReason = BillingTransport.ProductQueryFailureReason.PRODUCT_UNAVAILABLE;
        CoreC12BillingManager manager = buildManager(transport, new EntitlementStore(new InMemoryKeyValueStore()), new FakeScheduler());
        manager.start();

        List<ProductQueryOutcome> results = new ArrayList<>();
        manager.getProduct(results::add);

        assertFalse(results.get(0).available);
        assertNull(results.get(0).offer);
        assertEquals(BridgeStatus.PRODUCT_UNAVAILABLE, results.get(0).unavailableStatus);
    }

    @Test
    public void getProduct_whenAvailable_returnsTheSelectedOfferFields() {
        FakeBillingTransport transport = new FakeBillingTransport();
        transport.productOfferToReturn = offer();
        CoreC12BillingManager manager = buildManager(transport, new EntitlementStore(new InMemoryKeyValueStore()), new FakeScheduler());
        manager.start();

        List<ProductQueryOutcome> results = new ArrayList<>();
        manager.getProduct(results::add);

        assertTrue(results.get(0).available);
        assertNotNull(results.get(0).offer);
        assertEquals(PRODUCT_ID, results.get(0).offer.productId);
        assertEquals("$4.99", results.get(0).offer.formattedPrice);
    }
}
