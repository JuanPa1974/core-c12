package com.andaralab.corec12.billing;

import android.app.Activity;
import android.content.Context;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The only class in this spike that imports com.android.billingclient.api.* —
 * everything else (CoreC12BillingManager, PurchaseProcessor, PurchaseVerifier,
 * EntitlementStore) is written against BillingTransport and never touches the
 * SDK directly, so it can be exercised in plain JUnit tests with a fake.
 *
 * Sources for the shapes used here (Billing Library 9.1.0, current as of
 * this spike — see docs/architecture/ANDROID_BILLING_SPIKE.md for the full
 * list): developer.android.com/google/play/billing/integrate,
 * developer.android.com/reference/com/android/billingclient/api/BillingClient.Builder
 * (enableAutoServiceReconnection, added in 8.0),
 * developer.android.com/google/play/billing/one-time-product-multi-purchase-options-offers
 * (ProductDetails.getOneTimePurchaseOfferDetailsList — 9.x's multi-offer
 * one-time-product API; a single product can expose more than one eligible
 * offer, e.g. a regular purchase alongside a rental or promotional offer —
 * see pickOffer() below for why this spike refuses to guess among them).
 */
public final class GooglePlayBillingTransport implements BillingTransport {

    private final BillingClient billingClient;
    private PurchasesUpdateListener updateListener;

    public GooglePlayBillingTransport(Context context) {
        this.billingClient = BillingClient.newBuilder(context)
            .setListener(this::onBillingPurchasesUpdated)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    @Override
    public void connect(ConnectionCallback callback) {
        billingClient.startConnection(
            new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(BillingResult billingResult) {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        callback.onConnected();
                    } else {
                        callback.onFailed(ConnectFailureReason.BILLING_UNAVAILABLE);
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    // enableAutoServiceReconnection() handles reattempting the connection
                    // internally; this callback here is informational only for this spike.
                    callback.onFailed(ConnectFailureReason.DISCONNECTED);
                }
            }
        );
    }

    @Override
    public void setPurchasesUpdateListener(PurchasesUpdateListener listener) {
        this.updateListener = listener;
    }

    private void onBillingPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (updateListener == null) return;

        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            updateListener.onUserCancelled();
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null) {
            updateListener.onError(responseCodeName(code));
            return;
        }
        updateListener.onPurchasesUpdated(toEvidenceList(purchases));
    }

    @Override
    public void queryProduct(String productId, ProductQueryCallback callback) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                Collections.singletonList(
                    QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build()
                )
            )
            .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, queryProductDetailsResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                callback.onUnavailable(ProductQueryFailureReason.BILLING_UNAVAILABLE);
                return;
            }
            List<ProductDetails> list = queryProductDetailsResult.getProductDetailsList();
            if (list == null || list.isEmpty()) {
                // Real today: the product isn't configured in Play Console yet (Fase 3 §7).
                callback.onUnavailable(ProductQueryFailureReason.PRODUCT_UNAVAILABLE);
                return;
            }
            ProductDetails details = list.get(0);
            List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
            ProductDetails.OneTimePurchaseOfferDetails chosen = pickOffer(offers);
            if (chosen == null) {
                callback.onUnavailable(ProductQueryFailureReason.AMBIGUOUS_OFFERS);
                return;
            }
            callback.onAvailable(
                new ProductOffer(details.getProductId(), details.getName(), details.getDescription(), chosen.getFormattedPrice(), chosen.getOfferToken(), details)
            );
        });
    }

    /**
     * Exactly one eligible one-time-purchase offer is required. A catalog with zero offers is
     * unavailable; a catalog with more than one (e.g. a rental alongside the regular purchase,
     * or a promotional offer) is refused rather than silently taking offers.get(0) — Fase 3 §7
     * explicitly forbids assuming the first offer is the right one and forbids enabling
     * rentals/multi-offer/promotional logic. Once the real product is configured with exactly
     * the single permanent purchase option this app needs, this selects it automatically.
     */
    private static ProductDetails.OneTimePurchaseOfferDetails pickOffer(List<ProductDetails.OneTimePurchaseOfferDetails> offers) {
        if (offers == null || offers.size() != 1) return null;
        return offers.get(0);
    }

    @Override
    public void launchPurchase(Activity activity, ProductOffer offer, LaunchCallback callback) {
        if (!(offer.nativeProductDetails instanceof ProductDetails)) {
            callback.onFailedToStart("STALE_PRODUCT_OFFER");
            return;
        }
        ProductDetails details = (ProductDetails) offer.nativeProductDetails;

        BillingFlowParams flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).setOfferToken(offer.offerToken).build()
                )
            )
            .build();

        BillingResult result = billingClient.launchBillingFlow(activity, flowParams);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            callback.onFailedToStart(responseCodeName(result.getResponseCode()));
        }
        // OK: the real result (success, cancel, or error) always arrives via the
        // PurchasesUpdatedListener wired in setPurchasesUpdateListener/the constructor.
    }

    @Override
    public void queryPurchases(PurchasesQueryCallback callback) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
        billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                callback.onQueryFailed(responseCodeName(billingResult.getResponseCode()));
                return;
            }
            callback.onResult(toEvidenceList(purchases));
        });
    }

    @Override
    public void acknowledge(String purchaseToken, AckCallback callback) {
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchaseToken).build();
        billingClient.acknowledgePurchase(params, billingResult -> {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                callback.onAcknowledged();
            } else {
                callback.onFailed(responseCodeName(billingResult.getResponseCode()));
            }
        });
    }

    @Override
    public void endConnection() {
        billingClient.endConnection();
    }

    private static List<PurchaseEvidence> toEvidenceList(List<Purchase> purchases) {
        List<PurchaseEvidence> result = new ArrayList<>();
        for (Purchase p : purchases) {
            result.add(toEvidence(p));
        }
        return result;
    }

    private static PurchaseEvidence toEvidence(Purchase purchase) {
        // A single non-consumable product -> one product id per purchase in practice;
        // getProducts() is a list because Play also supports multi-product purchases.
        String productId = purchase.getProducts().isEmpty() ? null : purchase.getProducts().get(0);
        PurchaseEvidence.State state;
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            state = PurchaseEvidence.State.PURCHASED;
        } else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            state = PurchaseEvidence.State.PENDING;
        } else {
            state = PurchaseEvidence.State.UNKNOWN;
        }
        return new PurchaseEvidence(
            productId,
            purchase.getPurchaseToken(),
            purchase.getOriginalJson(),
            purchase.getSignature(),
            state,
            purchase.isAcknowledged(),
            purchase.getPurchaseTime()
        );
    }

    private static String responseCodeName(int code) {
        switch (code) {
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
                return "SERVICE_DISCONNECTED";
            case BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED:
                return "FEATURE_NOT_SUPPORTED";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
                return "SERVICE_UNAVAILABLE";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
                return "BILLING_UNAVAILABLE";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
                return "ITEM_UNAVAILABLE";
            case BillingClient.BillingResponseCode.DEVELOPER_ERROR:
                return "DEVELOPER_ERROR";
            case BillingClient.BillingResponseCode.ERROR:
                return "ERROR";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED:
                return "ITEM_ALREADY_OWNED";
            case BillingClient.BillingResponseCode.ITEM_NOT_OWNED:
                return "ITEM_NOT_OWNED";
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
                return "NETWORK_ERROR";
            default:
                return "RESPONSE_CODE_" + code;
        }
    }
}
