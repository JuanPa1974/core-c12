package com.andaralab.corec12.billing;

import android.app.Activity;
import java.util.List;

/**
 * Everything CoreC12BillingManager needs from Play Billing, as a seam:
 * GooglePlayBillingTransport is the real implementation (the only class in
 * this spike that imports com.android.billingclient.api.*); tests use a
 * fake implementing this same interface — "adaptador Billing sustituible
 * exclusivamente en tests" (Fase 3 §12), never a real Play Store call in a
 * test.
 */
public interface BillingTransport {

    enum ConnectFailureReason {
        BILLING_UNAVAILABLE,
        DISCONNECTED,
    }

    interface ConnectionCallback {
        void onConnected();
        void onFailed(ConnectFailureReason reason);
    }

    /** Fired for every purchases-updated event: a fresh purchase, a duplicate/late callback, or a user cancellation. */
    interface PurchasesUpdateListener {
        void onPurchasesUpdated(List<PurchaseEvidence> purchases);
        void onUserCancelled();
        /** Any other non-OK, non-cancel response code (e.g. ITEM_ALREADY_OWNED, network/service errors). */
        void onError(String reasonCode);
    }

    enum ProductQueryFailureReason {
        /** Play returned an empty/no matching product — real for now, since Play Console isn't configured yet. */
        PRODUCT_UNAVAILABLE,
        /** More than one (or zero) eligible one-time purchase offers — cannot pick one without guessing. */
        AMBIGUOUS_OFFERS,
        /** BillingClient itself is unavailable/not connected/query failed. */
        BILLING_UNAVAILABLE,
    }

    interface ProductQueryCallback {
        void onAvailable(ProductOffer offer);
        void onUnavailable(ProductQueryFailureReason reason);
    }

    interface PurchasesQueryCallback {
        void onResult(List<PurchaseEvidence> purchases);
        /** Query itself failed (service disconnected, network...) — distinct from "queried fine, list is empty". */
        void onQueryFailed(String reasonCode);
    }

    interface AckCallback {
        void onAcknowledged();
        void onFailed(String reasonCode);
    }

    /** launchBillingFlow's own BillingResult is synchronous; the actual purchase result always arrives later via PurchasesUpdateListener, win or lose. */
    interface LaunchCallback {
        void onFailedToStart(String reasonCode);
    }

    void connect(ConnectionCallback callback);

    /** Replaces any previous listener; there is only ever one active purchase flow/listener (Fase 3 §6). */
    void setPurchasesUpdateListener(PurchasesUpdateListener listener);

    void queryProduct(String productId, ProductQueryCallback callback);

    /** offer must come from a ProductQueryCallback#onAvailable() result — never reconstructed by the caller. */
    void launchPurchase(Activity activity, ProductOffer offer, LaunchCallback callback);

    void queryPurchases(PurchasesQueryCallback callback);

    void acknowledge(String purchaseToken, AckCallback callback);

    void endConnection();
}
