package com.andaralab.corec12.billing;

/**
 * Transport-agnostic snapshot of one purchase, as needed by PurchaseProcessor.
 * Deliberately does NOT depend on com.android.billingclient.api.Purchase —
 * that keeps PurchaseProcessor (and its tests) free of the Play Billing SDK
 * entirely; GooglePlayBillingTransport is the only place that maps a real
 * Purchase into this shape.
 */
public final class PurchaseEvidence {

    public enum State { PENDING, PURCHASED, UNKNOWN }

    public final String productId;
    public final String purchaseToken;
    public final String originalJson; // the signed payload (Purchase.getOriginalJson())
    public final String signatureBase64; // Purchase.getSignature(), still base64 here
    public final State state;
    public final boolean acknowledged;
    public final long purchaseTimeMillis;

    public PurchaseEvidence(
        String productId,
        String purchaseToken,
        String originalJson,
        String signatureBase64,
        State state,
        boolean acknowledged,
        long purchaseTimeMillis
    ) {
        this.productId = productId;
        this.purchaseToken = purchaseToken;
        this.originalJson = originalJson;
        this.signatureBase64 = signatureBase64;
        this.state = state;
        this.acknowledged = acknowledged;
        this.purchaseTimeMillis = purchaseTimeMillis;
    }
}
