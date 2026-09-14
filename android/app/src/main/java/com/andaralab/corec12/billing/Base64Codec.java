package com.andaralab.corec12.billing;

/**
 * Single seam for base64 decoding. android.util.Base64 requires API 26+ features
 * are fine, but more importantly it is a framework stub in plain JUnit tests
 * (no Robolectric here) and throws at runtime there. Everything in this
 * package that needs base64 (the Play public key, a purchase signature)
 * goes through this interface instead of calling android.util.Base64
 * directly, so PurchaseVerifier/PurchaseProcessor stay testable on a plain
 * JVM. The real implementation (AndroidBase64Codec) is the only class in
 * this package that touches android.util.Base64.
 */
public interface Base64Codec {
    byte[] decode(String base64);
}
