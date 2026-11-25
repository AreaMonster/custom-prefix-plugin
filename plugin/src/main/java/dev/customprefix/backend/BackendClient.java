package dev.customprefix.backend;

import dev.customprefix.config.PluginConfig;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/**
 * All calls are non-blocking (java.net.http's async API), so nothing here
 * ever blocks a Velocity/Netty thread. Every method's returned future
 * completes exceptionally with a {@link BackendException} on any non-2xx
 * response, network error, or malformed body — callers should always
 * attach a {@code .exceptionally}/{@code .handle}.
 */
public final class BackendClient {

  private final PluginConfig config;
  private final HttpClient http;

  public BackendClient(PluginConfig config) {
    this.config = config;
    this.http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(config.httpTimeoutSeconds()))
        .build();
  }

  /** @param currentPrefix the player's current rank prefix, or null if unknown */
  public CompletableFuture<SessionCreateResult> createSession(
      UUID playerUuid, String playerName, boolean bypassFilter, String currentPrefix) {
    String body = "{\"playerUuid\":\"" + MiniJson.escape(playerUuid.toString()) + "\","
        + "\"playerName\":\"" + MiniJson.escape(playerName) + "\","
        + "\"bypassFilter\":" + bypassFilter
        + (currentPrefix != null ? ",\"currentPrefix\":\"" + MiniJson.escape(currentPrefix) + "\"" : "")
        + "}";

    HttpRequest request = requestBuilder("/api/sessions")
        .POST(HttpRequest.BodyPublishers.ofString(body))
        .header("Content-Type", "application/json")
        .build();

    return send(request).thenApply(response -> {
      Map<String, String> json = parseOrThrow(response);
      return new SessionCreateResult(
          json.get("token"),
          json.get("url"),
          Long.parseLong(json.get("expiresAt"))
      );
    });
  }

  /** Same response shape as createSession — reusing SessionCreateResult rather than a near-duplicate type. */
  public CompletableFuture<SessionCreateResult> requestAdminLink(UUID playerUuid, String playerName) {
    String body = "{\"playerUuid\":\"" + MiniJson.escape(playerUuid.toString()) + "\","
        + "\"playerName\":\"" + MiniJson.escape(playerName) + "\"}";

    HttpRequest request = requestBuilder("/api/admin/magic-link")
        .POST(HttpRequest.BodyPublishers.ofString(body))
        .header("Content-Type", "application/json")
        .build();

    return send(request).thenApply(response -> {
      Map<String, String> json = parseOrThrow(response);
      return new SessionCreateResult(
          json.get("token"),
          json.get("url"),
          Long.parseLong(json.get("expiresAt"))
      );
    });
  }

  public CompletableFuture<SessionStatus> getStatus(String token) {
    HttpRequest request = requestBuilder("/api/sessions/" + token + "/status").GET().build();

    return send(request).thenApply(response -> {
      Map<String, String> json = parseOrThrow(response);
      String prefixString = "null".equals(json.get("prefixString")) ? null : json.get("prefixString");
      return new SessionStatus(json.get("status"), prefixString, Long.parseLong(json.get("expiresAt")));
    });
  }

  public CompletableFuture<Void> ack(String token) {
    HttpRequest request = requestBuilder("/api/sessions/" + token + "/ack")
        .POST(HttpRequest.BodyPublishers.noBody())
        .build();

    return send(request).thenApply(response -> {
      parseOrThrow(response);
      return null;
    });
  }

  private HttpRequest.Builder requestBuilder(String path) {
    return HttpRequest.newBuilder()
        .uri(URI.create(config.backendBaseUrl() + path))
        .timeout(Duration.ofSeconds(config.httpTimeoutSeconds()))
        .header("X-API-Key", config.backendApiKey());
  }

  private CompletableFuture<HttpResponse<String>> send(HttpRequest request) {
    return http.sendAsync(request, HttpResponse.BodyHandlers.ofString())
        .exceptionallyCompose(err -> {
          Throwable cause = err instanceof CompletionException ? err.getCause() : err;
          // Include the exception's class name and the URI we tried, not just
          // getMessage() — several common java.net.http failure causes (e.g.
          // UnresolvedAddressException for a bad/unreachable hostname) have a
          // null message, which otherwise makes this log line useless.
          String detail = cause.getClass().getSimpleName()
              + (cause.getMessage() != null ? ": " + cause.getMessage() : " (no message)");
          return CompletableFuture.failedFuture(
              new BackendException(-1,
                  "network error calling backend at " + request.uri() + " — " + detail, cause));
        });
  }

  private Map<String, String> parseOrThrow(HttpResponse<String> response) {
    int status = response.statusCode();
    if (status < 200 || status >= 300) {
      throw new BackendException(status, "backend returned " + status + ": " + response.body());
    }
    if (response.body() == null || response.body().isBlank()) {
      return Map.of();
    }
    try {
      return MiniJson.parseFlatObject(response.body());
    } catch (Exception e) {
      throw new BackendException(status, "malformed response body from backend: " + response.body(), e);
    }
  }
}
