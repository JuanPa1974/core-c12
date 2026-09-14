package com.andaralab.corec12.billing;

import android.app.Activity;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Queue;
import java.util.LinkedList;

/**
 * Test-only BillingTransport ("adaptador Billing sustituible exclusivamente
 * en tests" — Fase 3 §12). Every method is scripted by the test via the
 * public fields/queues below; nothing here talks to Play Services. Captures
 * the PurchasesUpdateListener the manager registers so a test can push
 * purchase-update events into CoreC12BillingManager exactly like the real
 * PurchasesUpdatedListener would.
 */
final class FakeBillingTransport implements BillingTransport {

    // ---- scripted behavior ----
    boolean connectSucceeds = true;
    ConnectFailureReason connectFailureReason = ConnectFailureReason.BILLING_UNAVAILABLE;
    int connectCallCount = 0;

    ProductOffer productOfferToReturn = null;
    ProductQueryFailureReason productFailureReason = ProductQueryFailureReason.PRODUCT_UNAVAILABLE;

    /** If non-null, launchPurchase() fails synchronously with this reason instead of "starting". */
    String launchFailureReason = null;
    int launchPurchaseCallCount = 0;

    /** FIFO of purchases-query results; each queryPurchases() call consumes one (or repeats the last if the queue is empty). */
    final Queue<Object> purchasesQueryResults = new LinkedList<>(); // List<PurchaseEvidence> or a String (failure reason)
    boolean queryPurchasesQueryFailed = false;
    String queryPurchasesFailureReason = "SERVICE_DISCONNECTED";
    List<PurchaseEvidence> queryPurchasesResult = new ArrayList<>();

    /** FIFO of ack outcomes; consumed one per acknowledge() call. Defaults to always succeeding. */
    final Deque<Boolean> ackOutcomes = new ArrayDeque<>();
    String ackFailureReason = "SERVICE_DISCONNECTED";
    int acknowledgeCallCount = 0;
    final List<String> acknowledgedTokensInOrder = new ArrayList<>();

    boolean endConnectionCalled = false;

    // ---- captured listener ----
    private PurchasesUpdateListener listener;

    @Override
    public void connect(ConnectionCallback callback) {
        connectCallCount++;
        if (connectSucceeds) {
            callback.onConnected();
        } else {
            callback.onFailed(connectFailureReason);
        }
    }

    @Override
    public void setPurchasesUpdateListener(PurchasesUpdateListener listener) {
        this.listener = listener;
    }

    PurchasesUpdateListener capturedListener() {
        return listener;
    }

    @Override
    public void queryProduct(String productId, ProductQueryCallback callback) {
        if (productOfferToReturn != null) {
            callback.onAvailable(productOfferToReturn);
        } else {
            callback.onUnavailable(productFailureReason);
        }
    }

    @Override
    public void launchPurchase(Activity activity, ProductOffer offer, LaunchCallback callback) {
        launchPurchaseCallCount++;
        if (launchFailureReason != null) {
            callback.onFailedToStart(launchFailureReason);
        }
        // else: silence — the test pushes the result later via capturedListener().
    }

    @Override
    public void queryPurchases(PurchasesQueryCallback callback) {
        Object scripted = purchasesQueryResults.poll();
        if (scripted instanceof String) {
            callback.onQueryFailed((String) scripted);
            return;
        }
        if (scripted instanceof List) {
            @SuppressWarnings("unchecked")
            List<PurchaseEvidence> list = (List<PurchaseEvidence>) scripted;
            callback.onResult(list);
            return;
        }
        // No more scripted responses queued: fall back to the plain fields (simplest case, single check).
        if (queryPurchasesQueryFailed) {
            callback.onQueryFailed(queryPurchasesFailureReason);
        } else {
            callback.onResult(queryPurchasesResult);
        }
    }

    @Override
    public void acknowledge(String purchaseToken, AckCallback callback) {
        acknowledgeCallCount++;
        acknowledgedTokensInOrder.add(purchaseToken);
        Boolean scripted = ackOutcomes.poll();
        boolean succeeds = scripted != null ? scripted : true;
        if (succeeds) {
            callback.onAcknowledged();
        } else {
            callback.onFailed(ackFailureReason);
        }
    }

    @Override
    public void endConnection() {
        endConnectionCalled = true;
    }
}
