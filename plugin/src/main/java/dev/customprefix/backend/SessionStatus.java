package dev.customprefix.backend;

/** prefixString is null while status is "pending". */
public record SessionStatus(String status, String prefixString, long expiresAt) {
  public boolean isReady() {
    return "ready".equals(status);
  }

  public boolean isPending() {
    return "pending".equals(status);
  }
}
