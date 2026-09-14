package com.andaralab.corec12.billing;

import com.andaralab.corec12.BuildConfig;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Fase 3 — Android Billing spike. Registered ONLY in debug builds (see
 * MainActivity.registerDebugOnlyPlugins()) — this class is compiled into
 * every build type, but MainActivity only calls registerPlugin() for it
 * when BuildConfig.DEBUG is true, so it never becomes reachable from JS in
 * a release build. It does not implement CAPBridgedPlugin the way the iOS
 * side does (jsName there is a compile-time contract); here the JS-facing
 * name comes from @CapacitorPlugin(name=...) below.
 *
 * src/platform/purchases.js's isSupported() stays limited to iOS during
 * this phase (Fase 3 §5) — nothing in the production JS layer calls any
 * method on this plugin. It is only reachable directly via
 * Capacitor.Plugins.CoreC12Purchases.* from a debug/diagnostic context,
 * which is how this spike is validated (see the Fase 3 emulator report).
 *
 * Google Play/StoreKit results are intentionally NOT unified under the
 * same status vocabulary — see BridgeStatus's header for why "verified"
 * specifically is never reused here.
 */
@CapacitorPlugin(name = "CoreC12Purchases")
public class CoreC12PurchasesPlugin extends Plugin {

    // Matches the iOS plugin's product id (ios/App/App/CoreC12PurchasesPlugin.swift) —
    // Apple and Google catalogs/purchases are independent, but the product identity is shared.
    private static final String PRODUCT_ID = "com.andaralab.corec12.pro";

    private CoreC12BillingManager manager;

    @Override
    public void load() {
        BillingTransport transport = new GooglePlayBillingTransport(getContext());
        Base64Codec base64Codec = new AndroidBase64Codec();
        PurchaseVerifier verifier = new PurchaseVerifier(decodeConfiguredPublicKey(base64Codec));
        PurchaseProcessor processor = new PurchaseProcessor(verifier, base64Codec, PRODUCT_ID);
        EntitlementStore store = new EntitlementStore(new SharedPreferencesKeyValueStore(getContext()));
        Scheduler scheduler = new AndroidScheduler();

        manager = new CoreC12BillingManager(transport, processor, store, scheduler, PRODUCT_ID);
        manager.setEntitlementChangedListener(() -> notifyListeners("entitlementChanged", new JSObject()));
        manager.start();
    }

    /**
     * BuildConfig.PLAY_LICENSING_PUBLIC_KEY_BASE64: the Play Console "App
     * integrity" > "Licensing" public key (Base64 X.509 DER) — a PUBLIC
     * value safe to ship in the APK, entirely distinct from the app's
     * signing/keystore key (private, never in source control, never in
     * BuildConfig). Empty by default (real key not available yet — Fase 3
     * §8): PurchaseVerifier then reports every purchase as CONFIG_INCOMPLETE
     * rather than silently skipping verification. See android/app/build.gradle.
     */
    private static byte[] decodeConfiguredPublicKey(Base64Codec base64Codec) {
        String configured = BuildConfig.PLAY_LICENSING_PUBLIC_KEY_BASE64;
        if (configured == null || configured.isEmpty()) return null;
        try {
            return base64Codec.decode(configured);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (manager != null) manager.onResume();
    }

    @Override
    protected void handleOnDestroy() {
        if (manager != null) manager.end();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getProduct(PluginCall call) {
        manager.getProduct(outcome -> {
            JSObject result = new JSObject();
            result.put("available", outcome.available);
            if (outcome.available) {
                ProductOffer offer = outcome.offer;
                result.put("id", offer.productId);
                result.put("name", offer.name);
                result.put("description", offer.description);
                result.put("displayPrice", offer.formattedPrice);
            } else {
                result.put("status", outcome.unavailableStatus.name());
                if (outcome.message != null) result.put("message", outcome.message);
            }
            call.resolve(result);
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        manager.purchase(getActivity(), result -> call.resolve(toJs(result)));
    }

    @PluginMethod
    public void getEntitlement(PluginCall call) {
        manager.getEntitlement(result -> call.resolve(toJs(result)));
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        manager.restorePurchases(result -> call.resolve(toJs(result)));
    }

    private static JSObject toJs(BridgeResult result) {
        JSObject js = new JSObject();
        js.put("status", result.status.name());
        js.put("isPro", result.isPro);
        if (result.message != null) js.put("message", result.message);
        return js;
    }
}
