package com.meteor.webapp;

class WebAppException extends Exception {
    public WebAppException(String detailMessage) {
        super(detailMessage);
    }

    public WebAppException(String detailMessage, Throwable throwable) {
        super(detailMessage, throwable);
    }

    public WebAppException(Throwable throwable) {
        super(throwable);
    }
}
