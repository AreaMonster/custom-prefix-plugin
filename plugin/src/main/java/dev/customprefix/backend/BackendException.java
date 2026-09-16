package dev.customprefix.backend;

/** Thrown when the backend responds with a non-2xx status or a malformed body. */
public final class BackendException extends RuntimeException {
  private final int statusCode; // -1 if the request never got a response (network error)

  public BackendException(int statusCode, String message) {
    super(message);
    this.statusCode = statusCode;
  }

  public BackendException(int statusCode, String message, Throwable cause) {
    super(message, cause);
    this.statusCode = statusCode;
  }

  public int statusCode() {
    return statusCode;
  }

  /** 410 Gone means the session expired/was consumed — a normal, expected outcome, not a real error. */
  public boolean isGone() {
    return statusCode == 410 || statusCode == 404;
  }
}
