package com.andaralab.corec12;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import com.andaralab.corec12.billing.CoreC12PurchasesPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Umbral estandar de Android para "pantalla grande" (tablets), en dp de
    // ancho minimo. En pantallas >= 600dp no se restringe la orientacion;
    // por debajo, se fuerza horizontal (ambas direcciones via sensor).
    private static final int LARGE_SCREEN_SMALLEST_WIDTH_DP = 600;

    // Centinela: aun no se aplico ninguna politica de orientacion. Evita
    // llamadas redundantes a setRequestedOrientation() y el bucle que
    // causaria volver a disparar onConfigurationChanged() sin necesidad.
    private int appliedOrientationPolicy = Integer.MIN_VALUE;

    // Fase 3 — Android Billing spike: CoreC12PurchasesPlugin is registered
    // ONLY in debug builds. BuildConfig.DEBUG is false in a release build
    // regardless of signing, so a release build never registers this
    // plugin and it is unreachable from JS there — see
    // docs/architecture/ANDROID_BILLING_SPIKE.md. The production JS layer
    // (src/platform/purchases.js) does not call it either way: isSupported()
    // stays limited to iOS this phase.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        applyOrientationPolicy(getResources().getConfiguration());
        if (BuildConfig.DEBUG) {
            registerPlugin(CoreC12PurchasesPlugin.class);
        }
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyOrientationPolicy(newConfig);
    }

    private void applyOrientationPolicy(Configuration config) {
        boolean isLargeScreen = config.smallestScreenWidthDp >= LARGE_SCREEN_SMALLEST_WIDTH_DP;
        int policy = isLargeScreen
            ? ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            : ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;

        if (policy != appliedOrientationPolicy) {
            appliedOrientationPolicy = policy;
            setRequestedOrientation(policy);
        }
    }
}
