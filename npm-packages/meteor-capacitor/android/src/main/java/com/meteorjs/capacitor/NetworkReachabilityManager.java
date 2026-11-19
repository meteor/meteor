/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

package com.meteorjs.capacitor;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import java.util.concurrent.Executor;

final class NetworkReachabilityManager {

    enum Status {
        UNKNOWN,
        NOT_REACHABLE,
        REACHABLE
    }

    interface Callback {
        void onStatusChanged(Status status);
    }

    private final ConnectivityManager connectivityManager;
    private final Executor callbackExecutor;

    private ConnectivityManager.NetworkCallback networkCallback;
    private Callback callback;
    private volatile boolean monitoring;
    private volatile Status status = Status.UNKNOWN;

    NetworkReachabilityManager(Context context, Executor callbackExecutor) {
        this.connectivityManager = (ConnectivityManager) context.getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        this.callbackExecutor = callbackExecutor;
    }

    void setCallback(Callback callback) {
        this.callback = callback;
    }

    @SuppressLint("MissingPermission")
    boolean startMonitoring() {
        if (monitoring || connectivityManager == null) {
            return false;
        }

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                updateStatus(Status.REACHABLE);
            }

            @Override
            public void onLost(Network network) {
                if (isCurrentlyReachable()) {
                    updateStatus(Status.REACHABLE);
                } else {
                    updateStatus(Status.NOT_REACHABLE);
                }
            }

            @Override
            public void onUnavailable() {
                updateStatus(Status.NOT_REACHABLE);
            }
        };

        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
            monitoring = true;
            updateStatus(isCurrentlyReachable() ? Status.REACHABLE : Status.NOT_REACHABLE);
            return true;
        } catch (Throwable ignored) {
            networkCallback = null;
            monitoring = false;
            return false;
        }
    }

    void stopMonitoring() {
        if (!monitoring || connectivityManager == null || networkCallback == null) {
            return;
        }

        try {
            connectivityManager.unregisterNetworkCallback(networkCallback);
        } catch (Throwable ignored) {
            // ignore callback cleanup failures during teardown
        }

        monitoring = false;
        networkCallback = null;
    }

    Status getStatus() {
        return status;
    }

    @SuppressLint("MissingPermission")
    private boolean isCurrentlyReachable() {
        if (connectivityManager == null) {
            return false;
        }

        Network active = connectivityManager.getActiveNetwork();
        if (active == null) {
            return false;
        }

        NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(active);
        return capabilities != null
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private void updateStatus(Status newStatus) {
        if (status == newStatus) {
            return;
        }

        status = newStatus;
        Callback target = callback;
        if (target == null) {
            return;
        }

        callbackExecutor.execute(() -> target.onStatusChanged(newStatus));
    }
}
