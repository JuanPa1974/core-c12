package com.andaralab.corec12.billing;

/** Result of getProduct() — a different shape from BridgeResult because it carries catalog info, not entitlement. */
public final class ProductQueryOutcome {

    public final boolean available;
    public final ProductOffer offer; // null when !available
    public final BridgeStatus unavailableStatus; // null when available
    public final String message;

    private ProductQueryOutcome(boolean available, ProductOffer offer, BridgeStatus unavailableStatus, String message) {
        this.available = available;
        this.offer = offer;
        this.unavailableStatus = unavailableStatus;
        this.message = message;
    }

    public static ProductQueryOutcome available(ProductOffer offer) {
        return new ProductQueryOutcome(true, offer, null, null);
    }

    public static ProductQueryOutcome unavailable(BridgeStatus status, String message) {
        return new ProductQueryOutcome(false, null, status, message);
    }
}
