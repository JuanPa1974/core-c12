package com.andaralab.corec12;

import android.os.Bundle;
import com.andaralab.corec12.billing.CoreC12PurchasesPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Fase 3 — Android Billing spike: CoreC12PurchasesPlugin is registered
    // ONLY in debug builds. BuildConfig.DEBUG is false in a release build
    // regardless of signing, so a release build never registers this
    // plugin and it is unreachable from JS there — see
    // docs/architecture/ANDROID_BILLING_SPIKE.md. The production JS layer
    // (src/platform/purchases.js) does not call it either way: isSupported()
    // stays limited to iOS this phase.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (BuildConfig.DEBUG) {
            registerPlugin(CoreC12PurchasesPlugin.class);
        }
        super.onCreate(savedInstanceState);
    }
}
