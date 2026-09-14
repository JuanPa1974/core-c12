package com.andaralab.corec12.billing;

import android.app.Activity;
import java.util.List;
import java.util.function.Consumer;

/**
 * Owns the single BillingTransport connection and its lifecycle, and
 * orchestrates PurchaseProcessor + EntitlementStore around it — the piece
 * that turns transport events into bridge-facing results (Fase 3 §6, §9,
 * §11). Everything here is constructor-injected (transport, processor,
 * store, scheduler) so it is fully testable with fakes — no real
 * BillingClient, no real clock, no real Android Handler in tests.
 */
public final class CoreC12BillingManager {

    private static final int MAX_ACK_RETRIES = 3;
    private static final long[] ACK_RETRY_DELAYS_MS = { 2_000, 5_000, 10_000 };
    private static final long PURCHASE_RESULT_TIMEOUT_MS = 60_000;

    private final BillingTransport transport;
    private final PurchaseProcessor processor;
    private final EntitlementStore store;
    private final Scheduler scheduler;
    private final String expectedProductId;

    private boolean connected = false;
    private boolean purchaseInFlight = false;
    private Consumer<BridgeResult> pendingPurchaseCallback = null;
    private Runnable pendingPurchaseTimeout = null;
    private Runnable entitlementChangedListener = null;

    public CoreC12BillingManager(
        BillingTransport transport,
        PurchaseProcessor processor,
        EntitlementStore store,
        Scheduler scheduler,
        String expectedProductId
    ) {
        this.transport = transport;
        this.processor = processor;
        this.store = store;
        this.scheduler = scheduler;
        this.expectedProductId = expectedProductId;

        this.transport.setPurchasesUpdateListener(
            new BillingTransport.PurchasesUpdateListener() {
                @Override
                public void onPurchasesUpdated(List<PurchaseEvidence> purchases) {
                    handlePurchasesUpdated(purchases);
                }

                @Override
                public void onUserCancelled() {
                    handleUserCancelled();
                }

                @Override
                public void onError(String reasonCode) {
                    handleUpdateError(reasonCode);
                }
            }
        );
    }

    public void setEntitlementChangedListener(Runnable listener) {
        this.entitlementChangedListener = listener;
    }

    // ---- Lifecycle (Fase 3 §6: conectar, reconectar, volver a primer plano) ----

    public void start() {
        ensureConnected(() -> reconcile("connect"), reason -> {});
    }

    public void onResume() {
        if (connected) {
            reconcile("resume");
        } else {
            ensureConnected(() -> reconcile("resume"), reason -> {});
        }
    }

    public void end() {
        transport.endConnection();
    }

    private void ensureConnected(Runnable onReady, Consumer<BillingTransport.ConnectFailureReason> onFail) {
        if (connected) {
            onReady.run();
            return;
        }
        transport.connect(
            new BillingTransport.ConnectionCallback() {
                @Override
                public void onConnected() {
                    connected = true;
                    onReady.run();
                }

                @Override
                public void onFailed(BillingTransport.ConnectFailureReason reason) {
                    connected = false;
                    onFail.accept(reason);
                }
            }
        );
    }

    /** Recovery pass: query current INAPP purchases and process them idempotently. Never surfaced as a bridge call result on its own. */
    private void reconcile(String source) {
        transport.queryPurchases(
            new BillingTransport.PurchasesQueryCallback() {
                @Override
                public void onResult(List<PurchaseEvidence> purchases) {
                    processEvidences(purchases, source);
                }

                @Override
                public void onQueryFailed(String reasonCode) {
                    store.recordLastQuery(source, "QUERY_FAILED:" + reasonCode);
                    // Never touch confirmed entitlement on a failed reconciliation query.
                }
            }
        );
    }

    // ---- getProduct (Fase 3 §7) ----

    public void getProduct(Consumer<ProductQueryOutcome> callback) {
        ensureConnected(
            () ->
                transport.queryProduct(
                    expectedProductId,
                    new BillingTransport.ProductQueryCallback() {
                        @Override
                        public void onAvailable(ProductOffer offer) {
                            callback.accept(ProductQueryOutcome.available(offer));
                        }

                        @Override
                        public void onUnavailable(BillingTransport.ProductQueryFailureReason reason) {
                            callback.accept(ProductQueryOutcome.unavailable(mapProductFailure(reason), reason.name()));
                        }
                    }
                ),
            reason -> callback.accept(ProductQueryOutcome.unavailable(BridgeStatus.BILLING_UNAVAILABLE, reason.name()))
        );
    }

    private static BridgeStatus mapProductFailure(BillingTransport.ProductQueryFailureReason reason) {
        switch (reason) {
            case PRODUCT_UNAVAILABLE:
            case AMBIGUOUS_OFFERS:
                return BridgeStatus.PRODUCT_UNAVAILABLE;
            case BILLING_UNAVAILABLE:
            default:
                return BridgeStatus.BILLING_UNAVAILABLE;
        }
    }

    // ---- purchase (Fase 3 §6, §7: siempre re-consulta el producto, nunca reutiliza uno viejo) ----

    public void purchase(Activity activity, Consumer<BridgeResult> callback) {
        if (purchaseInFlight) {
            callback.accept(BridgeResult.of(BridgeStatus.PURCHASE_IN_PROGRESS, store.getConfirmedEntitlement().isPro));
            return;
        }
        purchaseInFlight = true;

        ensureConnected(
            () ->
                transport.queryProduct(
                    expectedProductId,
                    new BillingTransport.ProductQueryCallback() {
                        @Override
                        public void onAvailable(ProductOffer offer) {
                            launch(activity, offer, callback);
                        }

                        @Override
                        public void onUnavailable(BillingTransport.ProductQueryFailureReason reason) {
                            purchaseInFlight = false;
                            callback.accept(BridgeResult.of(mapProductFailure(reason), false, reason.name()));
                        }
                    }
                ),
            reason -> {
                purchaseInFlight = false;
                callback.accept(BridgeResult.of(BridgeStatus.BILLING_UNAVAILABLE, false, reason.name()));
            }
        );
    }

    private void launch(Activity activity, ProductOffer offer, Consumer<BridgeResult> callback) {
        transport.launchPurchase(
            activity,
            offer,
            reasonCode -> {
                purchaseInFlight = false;
                callback.accept(BridgeResult.of(BridgeStatus.BILLING_UNAVAILABLE, false, reasonCode));
            }
        );
        // launchBillingFlow's own result was OK (no onFailedToStart) — the real outcome, win or
        // lose, always arrives later via the PurchasesUpdateListener wired in the constructor.
        pendingPurchaseCallback = callback;
        pendingPurchaseTimeout = () -> resolvePendingPurchase(BridgeResult.of(BridgeStatus.QUERY_FAILED, store.getConfirmedEntitlement().isPro, "PURCHASE_RESULT_TIMEOUT"));
        scheduler.postDelayed(pendingPurchaseTimeout, PURCHASE_RESULT_TIMEOUT_MS);
    }

    // ---- PurchasesUpdatedListener plumbing ----

    private void handlePurchasesUpdated(List<PurchaseEvidence> purchases) {
        cancelPendingPurchaseTimeout();
        BridgeResult result = processEvidences(purchases, "purchase-update");
        resolvePendingPurchase(result);
    }

    private void handleUserCancelled() {
        cancelPendingPurchaseTimeout();
        resolvePendingPurchase(BridgeResult.of(BridgeStatus.CANCELLED, store.getConfirmedEntitlement().isPro));
    }

    private void handleUpdateError(String reasonCode) {
        cancelPendingPurchaseTimeout();
        if ("ITEM_ALREADY_OWNED".equals(reasonCode)) {
            // Reconciliación explícita (Fase 3 §12): el usuario ya es dueño del producto
            // (p.ej. una compra previa quedó sin reflejar localmente) — consultar en vez
            // de simplemente fallar.
            transport.queryPurchases(
                new BillingTransport.PurchasesQueryCallback() {
                    @Override
                    public void onResult(List<PurchaseEvidence> purchases) {
                        resolvePendingPurchase(processEvidences(purchases, "reconcile-already-owned"));
                    }

                    @Override
                    public void onQueryFailed(String reason) {
                        resolvePendingPurchase(BridgeResult.of(BridgeStatus.QUERY_FAILED, store.getConfirmedEntitlement().isPro, reason));
                    }
                }
            );
            return;
        }
        resolvePendingPurchase(BridgeResult.of(BridgeStatus.BILLING_UNAVAILABLE, store.getConfirmedEntitlement().isPro, reasonCode));
    }

    private void cancelPendingPurchaseTimeout() {
        if (pendingPurchaseTimeout != null) {
            scheduler.cancel(pendingPurchaseTimeout);
            pendingPurchaseTimeout = null;
        }
    }

    /** Resolves the in-flight purchase() call at most once — a duplicate/late event after that only updates state (see processEvidences), never re-resolves. */
    private void resolvePendingPurchase(BridgeResult result) {
        purchaseInFlight = false;
        Consumer<BridgeResult> callback = pendingPurchaseCallback;
        pendingPurchaseCallback = null;
        if (callback != null) {
            callback.accept(result);
        }
    }

    // ---- getEntitlement (Fase 3 §10: cache-first, nunca bloquea en una consulta) ----

    public void getEntitlement(Consumer<BridgeResult> callback) {
        EntitlementStore.ConfirmedEntitlement confirmed = store.getConfirmedEntitlement();
        if (confirmed.isPro) {
            callback.accept(BridgeResult.of(BridgeStatus.PRO_CONFIRMED, true));
        } else if (!store.listPendingAcks().isEmpty()) {
            callback.accept(BridgeResult.of(BridgeStatus.ACK_PENDING, false));
        } else {
            callback.accept(BridgeResult.of(BridgeStatus.NONE, false));
        }
        // Refresco en segundo plano: nunca retrasa ni reemplaza la respuesta ya dada arriba.
        if (connected) {
            reconcile("getEntitlement");
        }
    }

    // ---- restorePurchases (Fase 3 §10: consulta INAPP actual, nunca historial) ----

    public void restorePurchases(Consumer<BridgeResult> callback) {
        ensureConnected(
            () ->
                transport.queryPurchases(
                    new BillingTransport.PurchasesQueryCallback() {
                        @Override
                        public void onResult(List<PurchaseEvidence> purchases) {
                            callback.accept(processEvidences(purchases, "restore"));
                        }

                        @Override
                        public void onQueryFailed(String reasonCode) {
                            store.recordLastQuery("restore", "QUERY_FAILED:" + reasonCode);
                            // Nunca "éxito" de restore si no se pudo consultar; conserva el entitlement previo.
                            callback.accept(BridgeResult.of(BridgeStatus.QUERY_FAILED, store.getConfirmedEntitlement().isPro, reasonCode));
                        }
                    }
                ),
            reason -> callback.accept(BridgeResult.of(BridgeStatus.BILLING_UNAVAILABLE, store.getConfirmedEntitlement().isPro, reason.name()))
        );
    }

    // ---- Shared evidence processing (idempotente: segura de llamar con datos duplicados/tardíos) ----

    private BridgeResult processEvidences(List<PurchaseEvidence> purchases, String source) {
        BridgeStatus worst = null;
        for (PurchaseEvidence evidence : purchases) {
            PurchaseProcessor.Classification classification = processor.classify(evidence);
            processor.applyToStore(store, classification, evidence);

            switch (classification) {
                case NEEDS_ACK:
                    attemptAcknowledge(evidence, 0);
                    worst = higherPriority(worst, BridgeStatus.ACK_PENDING);
                    break;
                case VERIFICATION_FAILED:
                    worst = higherPriority(worst, BridgeStatus.VERIFICATION_FAILED);
                    break;
                case CONFIG_INCOMPLETE:
                    worst = higherPriority(worst, BridgeStatus.CONFIG_INCOMPLETE);
                    break;
                case PENDING:
                    worst = higherPriority(worst, BridgeStatus.PENDING);
                    break;
                case ALREADY_ACKNOWLEDGED:
                case PRODUCT_MISMATCH:
                case UNKNOWN_STATE:
                default:
                    break;
            }
        }
        store.recordLastQuery(source, "OK");

        boolean isPro = store.getConfirmedEntitlement().isPro;
        if (isPro) {
            notifyEntitlementChanged();
            return BridgeResult.of(BridgeStatus.PRO_CONFIRMED, true);
        }
        return BridgeResult.of(worst == null ? BridgeStatus.NONE : worst, false);
    }

    private static BridgeStatus higherPriority(BridgeStatus current, BridgeStatus candidate) {
        if (current == null) return candidate;
        return priority(candidate) > priority(current) ? candidate : current;
    }

    private static int priority(BridgeStatus status) {
        switch (status) {
            case VERIFICATION_FAILED:
                return 4;
            case CONFIG_INCOMPLETE:
                return 3;
            case ACK_PENDING:
                return 2;
            case PENDING:
                return 1;
            default:
                return 0;
        }
    }

    // ---- Acknowledgment con reintentos acotados mientras la app está activa (Fase 3 §9) ----

    private void attemptAcknowledge(PurchaseEvidence evidence, int attemptIndex) {
        transport.acknowledge(
            evidence.purchaseToken,
            new BillingTransport.AckCallback() {
                @Override
                public void onAcknowledged() {
                    store.setConfirmedEntitlement(evidence.productId);
                    store.removePendingAck(evidence.purchaseToken);
                    notifyEntitlementChanged();
                }

                @Override
                public void onFailed(String reasonCode) {
                    store.incrementAckAttempts(evidence.purchaseToken);
                    if (attemptIndex < MAX_ACK_RETRIES) {
                        long delay = ACK_RETRY_DELAYS_MS[Math.min(attemptIndex, ACK_RETRY_DELAYS_MS.length - 1)];
                        scheduler.postDelayed(() -> attemptAcknowledge(evidence, attemptIndex + 1), delay);
                    }
                    // Límite alcanzado dentro de esta sesión: el token permanece en pendingAck
                    // (EntitlementStore) para recuperarse en el próximo connect()/onResume() vía
                    // reconcile() — nunca se marca como completada, nunca se concede Pro aquí.
                }
            }
        );
    }

    private void notifyEntitlementChanged() {
        if (entitlementChangedListener != null) {
            entitlementChangedListener.run();
        }
    }
}
