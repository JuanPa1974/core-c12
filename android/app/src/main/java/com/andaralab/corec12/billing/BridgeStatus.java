package com.andaralab.corec12.billing;

/**
 * The bridge-facing result vocabulary (Fase 3 §11) — deliberately distinct
 * from iOS's StoreKit status strings ("verified", "unverified", "pending",
 * "cancelled", "unknown"; see ios/App/App/CoreC12PurchasesPlugin.swift).
 * "verified" on iOS means StoreKit 2's own cryptographic transaction
 * verification; reusing that word here for local RSA/SHA1 signature
 * verification would silently imply a guarantee this spike does not have.
 * PRO_CONFIRMED is Android's equivalent endpoint, reached through a
 * different, weaker verification path — see PurchaseVerifier's header.
 */
public enum BridgeStatus {
    /** Verified + acknowledged: Pro confirmed. */
    PRO_CONFIRMED,
    /** Payment not yet completed. */
    PENDING,
    /** Verified, acknowledgment attempt still in progress or not yet retried. */
    ACK_PENDING,
    /** User closed/cancelled the purchase flow — not an error. */
    CANCELLED,
    /** PURCHASED but the local signature check failed — evidence looks tampered or corrupted. */
    VERIFICATION_FAILED,
    /** PURCHASED but no verification public key is configured — cannot evaluate. */
    CONFIG_INCOMPLETE,
    /** The product isn't available from Play (real today: Play Console isn't configured yet). */
    PRODUCT_UNAVAILABLE,
    /** BillingClient itself isn't usable (unsupported, disconnected and unable to reconnect, etc). */
    BILLING_UNAVAILABLE,
    /** A query (product or purchases) failed — transient/unknown, never an authoritative "no". */
    QUERY_FAILED,
    /** No entitlement and nothing pending — the plain, unremarkable "not Pro yet" answer. */
    NONE,
    /** purchase() called while a purchase flow was already in flight — the new call is rejected, the original one is unaffected. */
    PURCHASE_IN_PROGRESS,
}
