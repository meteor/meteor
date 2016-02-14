package com.meteor.webapp;

class DownloadFailureException extends Exception {
    public DownloadFailureException(String detailMessage) {
        super(detailMessage);
    }

    public DownloadFailureException(String detailMessage, Throwable throwable) {
        super(detailMessage, throwable);
    }

    public DownloadFailureException(Throwable throwable) {
        super(throwable);
    }
}
