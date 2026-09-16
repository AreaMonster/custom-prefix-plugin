package dev.customprefix.backend;

public record SessionCreateResult(String token, String url, long expiresAt) {}
