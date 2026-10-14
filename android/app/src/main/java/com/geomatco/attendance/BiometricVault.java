package com.geomatco.attendance;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * ورود با اثر انگشت/چهره: کلید تیمِ هر کاربر با یک کلید AES در Android Keystore رمز می‌شود که
 * فقط بعد از تأیید بیومتریک قوی (BIOMETRIC_STRONG) قابل استفاده است و با ثبت اثر انگشت تازه باطل می‌شود.
 * خود کلید Keystore هیچ‌وقت از سخت‌افزار امن بیرون نمی‌آید.
 */
class BiometricVault {

    interface Result {
        void done(boolean ok, String payload);
    }

    private static final String PREFS = "geoteam_bio";
    private static final String KEYSTORE = "AndroidKeyStore";
    private final FragmentActivity activity;

    BiometricVault(FragmentActivity activity) {
        this.activity = activity;
    }

    private static String alias(String userId) {
        return "geoteam_bio_" + userId.replaceAll("[^A-Za-z0-9-]", "");
    }

    private SharedPreferences prefs() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String status() {
        if (Build.VERSION.SDK_INT < 23) return "unsupported";
        int r = BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (r == BiometricManager.BIOMETRIC_SUCCESS) return "available";
        if (r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return "none-enrolled";
        return "unavailable";
    }

    boolean enrolled(String userId) {
        return prefs().contains(alias(userId));
    }

    void remove(String userId) {
        prefs().edit().remove(alias(userId)).apply();
        try {
            KeyStore ks = KeyStore.getInstance(KEYSTORE);
            ks.load(null);
            ks.deleteEntry(alias(userId));
        } catch (Exception ignored) {
        }
    }

    void enroll(String userId, String rawB64, Result result) {
        if (!"available".equals(status())) {
            result.done(false, "اثر انگشت یا چهره روی این گوشی تنظیم نشده است");
            return;
        }
        try {
            SecretKey key = createKey(alias(userId));
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            final byte[] raw = Base64.decode(rawB64, Base64.NO_WRAP);
            prompt("روشن کردن ورود با اثر انگشت", cipher, new Result() {
                @Override
                public void done(boolean ok, String payload) {
                    if (!ok) { result.done(false, payload); return; }
                    try {
                        Cipher c = authenticated;
                        byte[] ct = c.doFinal(raw);
                        String v = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
                        prefs().edit().putString(alias(userId), v).apply();
                        result.done(true, "");
                    } catch (Exception e) {
                        result.done(false, "ذخیره کلید بیومتریک انجام نشد");
                    } finally {
                        java.util.Arrays.fill(raw, (byte) 0);
                    }
                }
            });
        } catch (Exception e) {
            result.done(false, "این گوشی کلید امن بیومتریک را پشتیبانی نمی‌کند");
        }
    }

    void unlock(String userId, Result result) {
        String v = prefs().getString(alias(userId), null);
        if (v == null || !v.contains(":")) {
            result.done(false, "ورود با اثر انگشت برای این حساب روشن نیست");
            return;
        }
        try {
            String[] parts = v.split(":", 2);
            final byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            final byte[] ct = Base64.decode(parts[1], Base64.NO_WRAP);
            KeyStore ks = KeyStore.getInstance(KEYSTORE);
            ks.load(null);
            SecretKey key = (SecretKey) ks.getKey(alias(userId), null);
            if (key == null) throw new KeyPermanentlyInvalidatedException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            prompt("ورود به Geo Team", cipher, new Result() {
                @Override
                public void done(boolean ok, String payload) {
                    if (!ok) { result.done(false, payload); return; }
                    try {
                        byte[] raw = authenticated.doFinal(ct);
                        String out = Base64.encodeToString(raw, Base64.NO_WRAP);
                        java.util.Arrays.fill(raw, (byte) 0);
                        result.done(true, out);
                    } catch (Exception e) {
                        result.done(false, "کلید بیومتریک معتبر نیست؛ با رمز وارد شوید");
                    }
                }
            });
        } catch (KeyPermanentlyInvalidatedException e) {
            remove(userId);
            result.done(false, "اثر انگشت‌های گوشی عوض شده؛ یک بار با رمز وارد شوید و دوباره روشنش کنید");
        } catch (Exception e) {
            result.done(false, "ورود با اثر انگشت انجام نشد؛ با رمز وارد شوید");
        }
    }

    private Cipher authenticated;

    private void prompt(String title, Cipher cipher, final Result result) {
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle("Geo Team")
                .setNegativeButtonText("لغو")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build();
        BiometricPrompt bp = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult r) {
                        BiometricPrompt.CryptoObject co = r.getCryptoObject();
                        if (co == null || co.getCipher() == null) { result.done(false, "تأیید انجام نشد"); return; }
                        authenticated = co.getCipher();
                        result.done(true, "");
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                        result.done(false, code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_USER_CANCELED
                                ? "لغو شد" : msg.toString());
                    }
                });
        bp.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
    }

    private static SecretKey createKey(String alias) throws Exception {
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true);
        if (Build.VERSION.SDK_INT >= 24) b.setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        kg.init(b.build());
        return kg.generateKey();
    }
}
