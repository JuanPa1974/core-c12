package com.andaralab.corec12.billing;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

/**
 * Local (on-device) verification of a Google Play purchase's signed
 * payload, following Play's documented scheme: the receipt JSON
 * (Purchase.getOriginalJson(), Play's INAPP_PURCHASE_DATA) is signed with
 * RSA/SHA1 (Purchase.getSignature(), Play's INAPP_DATA_SIGNATURE) against
 * the app's Base64 licensing public key from Play Console.
 *
 * This is client-side verification only. It raises the bar against casual
 * tampering of the purchase payload en route to this code, but Google's own
 * guidance is that server-side verification (via the Google Play Developer
 * API) is the authoritative check — a rooted/instrumented device can still
 * defeat on-device verification. This spike must never be presented as
 * equivalent to server verification (see docs/architecture/ANDROID_BILLING_SPIKE.md).
 *
 * Publisher's real licensing key: not available yet (Play Console product
 * isn't configured — see Fase 3 instructions). KEY_MISSING is the explicit,
 * honest result for that case; it is NOT the same as INVALID (a real,
 * failed verification attempt) and callers must not conflate the two into
 * a generic "no Pro" without recording which one occurred.
 */
public final class PurchaseVerifier {

    public enum Result {
        VALID,
        INVALID,
        /** No verification public key configured — cannot evaluate, not a failed check. */
        KEY_MISSING,
    }

    private static final String KEY_ALGORITHM = "RSA";
    private static final String SIGNATURE_ALGORITHM = "SHA1withRSA";

    private final PublicKey publicKey; // null when no verification key is configured/decodable

    /** @param publicKeyDerBytes X.509-encoded RSA public key bytes, already base64-decoded by the caller; null if none configured. */
    public PurchaseVerifier(byte[] publicKeyDerBytes) {
        this.publicKey = publicKeyDerBytes == null ? null : decodeKey(publicKeyDerBytes);
    }

    private static PublicKey decodeKey(byte[] derBytes) {
        try {
            KeyFactory keyFactory = KeyFactory.getInstance(KEY_ALGORITHM);
            return keyFactory.generatePublic(new X509EncodedKeySpec(derBytes));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * @param signedData   Purchase.getOriginalJson() — the exact bytes that were signed.
     * @param signatureBytes Purchase.getSignature(), already base64-decoded by the caller.
     */
    public Result verify(String signedData, byte[] signatureBytes) {
        if (publicKey == null) {
            return Result.KEY_MISSING;
        }
        if (signedData == null || signedData.isEmpty() || signatureBytes == null || signatureBytes.length == 0) {
            return Result.INVALID;
        }
        try {
            Signature sig = Signature.getInstance(SIGNATURE_ALGORITHM);
            sig.initVerify(publicKey);
            sig.update(signedData.getBytes(StandardCharsets.UTF_8));
            return sig.verify(signatureBytes) ? Result.VALID : Result.INVALID;
        } catch (Exception e) {
            // Malformed signature bytes, algorithm unavailable, etc. — never treat as VALID.
            return Result.INVALID;
        }
    }
}
