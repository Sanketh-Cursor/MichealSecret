package com.vaultlock.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;

@CapacitorPlugin(name = "BiometricAuth")
public class BiometricPlugin extends Plugin {

    @PluginMethod
    public void checkBiometricSupport(PluginCall call) {
        BiometricManager biometricManager = BiometricManager.from(getContext());
        int canAuthenticate = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL);

        JSObject ret = new JSObject();
        ret.put("isAvailable", canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String reason = call.getString("reason", "Unlock your vault");
        
        getBridge().executeOnMainThread(() -> {
            Executor executor = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt biometricPrompt = new BiometricPrompt(getActivity(),
                    executor, new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    call.reject(errString.toString(), String.valueOf(errorCode));
                }

                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                }

                @Override
                public void onAuthenticationFailed() {
                    super.onAuthenticationFailed();
                    // Just a failed attempt, don't reject yet as user might try again
                }
            });

            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("KeyKeeper Security")
                    .setSubtitle(reason)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build();

            biometricPrompt.authenticate(promptInfo);
        });
    }

    @PluginMethod
    public void setMasterPassword(PluginCall call) {
        String password = call.getString("password");
        if (password == null) {
            call.reject("Password is required");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences("secure_prefs", Context.MODE_PRIVATE);
        // Note: In a real app, this should be encrypted using Keystore.
        // For simplicity in this example, we'll store it directly, 
        // but we'll only allow retrieval AFTER biometric auth.
        prefs.edit().putString("master_password", password).apply();
        call.resolve();
    }

    @PluginMethod
    public void getMasterPassword(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("secure_prefs", Context.MODE_PRIVATE);
        String password = prefs.getString("master_password", null);

        if (password == null) {
            call.reject("No master password stored");
            return;
        }

        // We combine the auth and retrieval
        authenticateWithResult(call, password);
    }

    private void authenticateWithResult(PluginCall call, String password) {
        getBridge().executeOnMainThread(() -> {
            Executor executor = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt biometricPrompt = new BiometricPrompt(getActivity(),
                    executor, new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    call.reject(errString.toString());
                }

                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    JSObject ret = new JSObject();
                    ret.put("password", password);
                    call.resolve(ret);
                }

                @Override
                public void onAuthenticationFailed() {
                    super.onAuthenticationFailed();
                }
            });

            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("KeyKeeper Biometric Unlock")
                    .setSubtitle("Authenticate to retrieve your master password")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build();

            biometricPrompt.authenticate(promptInfo);
        });
    }
    
    @PluginMethod
    public void clearMasterPassword(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("secure_prefs", Context.MODE_PRIVATE);
        prefs.edit().remove("master_password").apply();
        call.resolve();
    }
}
