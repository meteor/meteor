/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CapacitorMeteorWebApp")
public class CapacitorMeteorWebAppPlugin extends Plugin {

    private CapacitorMeteorWebApp implementation;
    private Throwable initializationError;

    @Override
    public void load() {
        super.load();
        try {
            implementation = new CapacitorMeteorWebApp(getBridge());
            implementation.setEventCallback(new CapacitorMeteorWebApp.EventCallback() {
                @Override
                public void onUpdateAvailable(String version) {
                    JSObject payload = new JSObject();
                    payload.put("version", version);
                    notifyListeners("updateAvailable", payload);
                }

                @Override
                public void onError(String message) {
                    JSObject payload = new JSObject();
                    payload.put("message", message);
                    notifyListeners("error", payload);
                }
            });
        } catch (Throwable cause) {
            initializationError = cause;
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (implementation != null) {
            implementation.handleOnPause();
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (implementation != null) {
            implementation.handleOnResume();
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (implementation != null) {
            implementation.handleOnDestroy();
        }
    }

    @PluginMethod
    public void checkForUpdates(PluginCall call) {
        if (!ensureReady(call)) {
            return;
        }

        implementation.checkForUpdates(error -> {
            if (error != null) {
                rejectWithThrowable(call, error);
            } else {
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void startupDidComplete(PluginCall call) {
        if (!ensureReady(call)) {
            return;
        }

        implementation.startupDidComplete(error -> {
            if (error != null) {
                rejectWithThrowable(call, error);
            } else {
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        if (!ensureReady(call)) {
            return;
        }

        JSObject payload = new JSObject();
        payload.put("version", implementation.getCurrentVersion());
        call.resolve(payload);
    }

    @PluginMethod
    public void isUpdateAvailable(PluginCall call) {
        if (!ensureReady(call)) {
            return;
        }

        JSObject payload = new JSObject();
        payload.put("available", implementation.isUpdateAvailable());
        call.resolve(payload);
    }

    @PluginMethod
    public void reload(PluginCall call) {
        if (!ensureReady(call)) {
            return;
        }

        implementation.reload(error -> {
            if (error != null) {
                rejectWithThrowable(call, error);
            } else {
                call.resolve();
            }
        });
    }

    private boolean ensureReady(PluginCall call) {
        if (implementation != null) {
            return true;
        }

        if (initializationError != null) {
            rejectWithThrowable(
                call,
                new Exception(
                    "CapacitorMeteorWebApp failed to initialize: " + initializationError.getMessage(),
                    initializationError
                )
            );
            return false;
        }

        call.reject("CapacitorMeteorWebApp is not initialized");
        return false;
    }

    private void rejectWithThrowable(PluginCall call, Throwable error) {
        String message = error.getMessage() == null ? "Unknown error" : error.getMessage();
        if (error instanceof Exception) {
            call.reject(message, (Exception) error);
        } else {
            call.reject(message);
        }
    }
}
