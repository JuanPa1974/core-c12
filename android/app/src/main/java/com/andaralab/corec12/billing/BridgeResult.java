package com.andaralab.corec12.billing;

/** Immutable result of any of the 4 bridge operations. See BridgeStatus for the vocabulary. */
public final class BridgeResult {

    public final BridgeStatus status;
    public final boolean isPro;
    public final String message; // human-readable detail; never a purchase token or other payment data

    public BridgeResult(BridgeStatus status, boolean isPro, String message) {
        this.status = status;
        this.isPro = isPro;
        this.message = message;
    }

    public static BridgeResult of(BridgeStatus status, boolean isPro) {
        return new BridgeResult(status, isPro, null);
    }

    public static BridgeResult of(BridgeStatus status, boolean isPro, String message) {
        return new BridgeResult(status, isPro, message);
    }
}
