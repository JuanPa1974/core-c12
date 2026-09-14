package com.andaralab.corec12.billing;

/**
 * Pure classification of one purchase (Fase 3 §9's explicit states),
 * deliberately synchronous and free of BillingClient/Context — this is the
 * "procesamiento de estados" layer, separate from transport (BillingTransport),
 * verification (PurchaseVerifier) and persistence (EntitlementStore).
 *
 * classify() never mutates anything; applyToStore() applies only the
 * synchronous, idempotent effects of a classification. The one state this
 * class does NOT resolve — NEEDS_ACK actually reaching PRO_CONFIRMED — is
 * intentionally left to CoreC12BillingManager, because acknowledging a
 * purchase is an async BillingClient call: a purchase must never be marked
 * Pro before that call actually succeeds (see EntitlementStore's header).
 */
public final class PurchaseProcessor {

    public enum Classification {
        /** Payment not yet completed — no Pro, no acknowledgment attempted. */
        PENDING,
        /** Evidence for a different product than the one this app sells — never touch entitlement. */
        PRODUCT_MISMATCH,
        /** PURCHASED, but the signature did not verify against the configured key — no Pro. */
        VERIFICATION_FAILED,
        /** PURCHASED, but no verification key is configured — cannot evaluate, not a failed check. */
        CONFIG_INCOMPLETE,
        /** Verified and NOT yet acknowledged — the caller must attempt acknowledgePurchase(). */
        NEEDS_ACK,
        /** Verified AND already acknowledged (e.g. reconciliation, restore) — Pro confirmed immediately. */
        ALREADY_ACKNOWLEDGED,
        /** Any other/unrecognized purchase state — unknown, never treated as an authoritative "no". */
        UNKNOWN_STATE,
    }

    private final PurchaseVerifier verifier;
    private final Base64Codec base64Codec;
    private final String expectedProductId;

    public PurchaseProcessor(PurchaseVerifier verifier, Base64Codec base64Codec, String expectedProductId) {
        this.verifier = verifier;
        this.base64Codec = base64Codec;
        this.expectedProductId = expectedProductId;
    }

    public Classification classify(PurchaseEvidence evidence) {
        if (evidence == null || !expectedProductId.equals(evidence.productId)) {
            return Classification.PRODUCT_MISMATCH;
        }
        if (evidence.state == PurchaseEvidence.State.PENDING) {
            return Classification.PENDING;
        }
        if (evidence.state != PurchaseEvidence.State.PURCHASED) {
            return Classification.UNKNOWN_STATE;
        }

        byte[] signatureBytes;
        try {
            signatureBytes = base64Codec.decode(evidence.signatureBase64);
        } catch (Exception e) {
            signatureBytes = null; // malformed base64 in the payload -> treat as an invalid signature, not a crash
        }

        PurchaseVerifier.Result verifyResult = verifier.verify(evidence.originalJson, signatureBytes);
        switch (verifyResult) {
            case KEY_MISSING:
                return Classification.CONFIG_INCOMPLETE;
            case INVALID:
                return Classification.VERIFICATION_FAILED;
            case VALID:
            default:
                return evidence.acknowledged ? Classification.ALREADY_ACKNOWLEDGED : Classification.NEEDS_ACK;
        }
    }

    /** Synchronous, idempotent store effects only. See class header for why ack itself is not handled here. */
    public void applyToStore(EntitlementStore store, Classification classification, PurchaseEvidence evidence) {
        switch (classification) {
            case NEEDS_ACK:
                store.addPendingAck(evidence.purchaseToken, evidence.productId);
                break;
            case ALREADY_ACKNOWLEDGED:
                store.setConfirmedEntitlement(evidence.productId);
                store.removePendingAck(evidence.purchaseToken);
                break;
            case PENDING:
            case PRODUCT_MISMATCH:
            case VERIFICATION_FAILED:
            case CONFIG_INCOMPLETE:
            case UNKNOWN_STATE:
            default:
                // Never mutate confirmed entitlement or pending-ack bookkeeping for these.
                break;
        }
    }
}
