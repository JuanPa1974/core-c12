package com.andaralab.corec12.billing;

/**
 * The single, explicitly-selected permanent one-time purchase option for
 * our product — never "whatever offer happened to be first" (Play Billing
 * 9.x's multi-offer one-time-product API can return rentals, promotional or
 * preorder offers alongside the regular purchase option; see
 * GooglePlayBillingTransport for the selection rule and why an ambiguous
 * catalog is reported as unavailable rather than guessed).
 *
 * nativeProductDetails is an opaque handle (the real
 * com.android.billingclient.api.ProductDetails) that only
 * GooglePlayBillingTransport reads, so this class itself stays free of the
 * Billing SDK — it is not re-fetched or cached beyond a single
 * getProduct()->purchase() round trip (ProductDetails must not be reused
 * indefinitely; prices/offers can change).
 */
public final class ProductOffer {

    public final String productId;
    public final String name;
    public final String description;
    public final String formattedPrice;
    public final String offerToken;
    public final Object nativeProductDetails;

    public ProductOffer(
        String productId,
        String name,
        String description,
        String formattedPrice,
        String offerToken,
        Object nativeProductDetails
    ) {
        this.productId = productId;
        this.name = name;
        this.description = description;
        this.formattedPrice = formattedPrice;
        this.offerToken = offerToken;
        this.nativeProductDetails = nativeProductDetails;
    }
}
