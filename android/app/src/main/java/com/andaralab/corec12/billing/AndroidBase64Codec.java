package com.andaralab.corec12.billing;

import android.util.Base64;

/** Real, on-device Base64Codec. Never used from plain JUnit tests. */
public final class AndroidBase64Codec implements Base64Codec {
    @Override
    public byte[] decode(String base64) {
        return Base64.decode(base64, Base64.DEFAULT);
    }
}
