package com.andaralab.corec12.billing;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class PurchaseVerifierTest {

    @Test
    public void validSignatureOverExactData_isValid() {
        SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
        String data = "{\"productId\":\"com.andaralab.corec12.pro\",\"purchaseToken\":\"tok-1\"}";
        byte[] signature = kp.sign(data);

        PurchaseVerifier verifier = new PurchaseVerifier(kp.publicKeyDerBytes());

        assertEquals(PurchaseVerifier.Result.VALID, verifier.verify(data, signature));
    }

    @Test
    public void tamperedData_isInvalid() {
        SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
        String originalData = "{\"productId\":\"com.andaralab.corec12.pro\",\"purchaseToken\":\"tok-1\"}";
        byte[] signature = kp.sign(originalData);

        String tamperedData = "{\"productId\":\"com.andaralab.corec12.pro\",\"purchaseToken\":\"tok-9999\"}";

        PurchaseVerifier verifier = new PurchaseVerifier(kp.publicKeyDerBytes());

        assertEquals(PurchaseVerifier.Result.INVALID, verifier.verify(tamperedData, signature));
    }

    @Test
    public void signatureFromADifferentKey_isInvalid() {
        SyntheticSignedPurchase legitimate = new SyntheticSignedPurchase();
        SyntheticSignedPurchase attacker = new SyntheticSignedPurchase();
        String data = "{\"productId\":\"com.andaralab.corec12.pro\"}";
        byte[] attackerSignature = attacker.sign(data);

        // Verifier configured with the LEGITIMATE public key, but the data was signed by a different key.
        PurchaseVerifier verifier = new PurchaseVerifier(legitimate.publicKeyDerBytes());

        assertEquals(PurchaseVerifier.Result.INVALID, verifier.verify(data, attackerSignature));
    }

    @Test
    public void garbageSignatureBytes_isInvalid_neverThrows() {
        SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
        PurchaseVerifier verifier = new PurchaseVerifier(kp.publicKeyDerBytes());

        byte[] garbage = new byte[] { 1, 2, 3, 4, 5 };
        assertEquals(PurchaseVerifier.Result.INVALID, verifier.verify("{\"a\":1}", garbage));
    }

    @Test
    public void emptySignature_isInvalid() {
        SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
        PurchaseVerifier verifier = new PurchaseVerifier(kp.publicKeyDerBytes());

        assertEquals(PurchaseVerifier.Result.INVALID, verifier.verify("{\"a\":1}", new byte[0]));
    }

    @Test
    public void nullPublicKey_isKeyMissing_notInvalid() {
        // The real, not-yet-configured case (Fase 3 §8): Play Console's licensing
        // key isn't available. This must be distinguishable from a real failed check.
        PurchaseVerifier verifier = new PurchaseVerifier(null);

        SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
        byte[] signature = kp.sign("{\"a\":1}");

        assertEquals(PurchaseVerifier.Result.KEY_MISSING, verifier.verify("{\"a\":1}", signature));
    }

    @Test
    public void malformedPublicKeyBytes_behavesAsKeyMissing() {
        byte[] garbageKeyBytes = new byte[] { 9, 9, 9 };
        PurchaseVerifier verifier = new PurchaseVerifier(garbageKeyBytes);

        SyntheticSignedPurchase kp = new SyntheticSignedPurchase();
        byte[] signature = kp.sign("{\"a\":1}");

        assertEquals(PurchaseVerifier.Result.KEY_MISSING, verifier.verify("{\"a\":1}", signature));
    }
}
