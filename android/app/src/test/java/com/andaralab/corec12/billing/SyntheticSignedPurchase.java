package com.andaralab.corec12.billing;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;

/**
 * A synthetic RSA keypair + signed test payloads, generated fresh per test
 * run — created exclusively for tests (Fase 3 §8: "no confundir pruebas
 * reales de Google Play con pruebas con fakes o firmas sintéticas"). Never
 * a real Play Console key; never checked into any production path.
 */
final class SyntheticSignedPurchase {

    final KeyPair keyPair;

    SyntheticSignedPurchase() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            this.keyPair = generator.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    byte[] publicKeyDerBytes() {
        return keyPair.getPublic().getEncoded();
    }

    byte[] sign(String data) {
        try {
            Signature sig = Signature.getInstance("SHA1withRSA");
            sig.initSign(keyPair.getPrivate());
            sig.update(data.getBytes(StandardCharsets.UTF_8));
            return sig.sign();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
