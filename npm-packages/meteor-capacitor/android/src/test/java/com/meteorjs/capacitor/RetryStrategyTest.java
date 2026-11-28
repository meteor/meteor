package com.meteorjs.capacitor;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class RetryStrategyTest {

    @Test
    public void triangularBackoffMatchesExpectedIntervals() {
        RetryStrategy strategy = new RetryStrategy();

        assertEquals(0.1d, strategy.retryIntervalForAttempt(0), 0.0001d);
        assertEquals(1.0d, strategy.retryIntervalForAttempt(1), 0.0001d);
        assertEquals(2.0d, strategy.retryIntervalForAttempt(2), 0.0001d);
        assertEquals(4.0d, strategy.retryIntervalForAttempt(3), 0.0001d);
        assertEquals(7.0d, strategy.retryIntervalForAttempt(4), 0.0001d);
        assertEquals(11.0d, strategy.retryIntervalForAttempt(5), 0.0001d);
        assertEquals(30.0d, strategy.retryIntervalForAttempt(20), 0.0001d);
    }
}
