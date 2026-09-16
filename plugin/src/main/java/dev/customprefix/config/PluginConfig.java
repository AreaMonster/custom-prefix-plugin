package dev.customprefix.config;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.logging.Logger;

/**
 * Thin wrapper around a plain {@link Properties} file — no extra config
 * library dependency needed for a dozen flat keys. Copies the bundled
 * default config.properties into the plugin's data directory on first run.
 *
 * On every load, also merges in any keys present in the bundled defaults
 * but missing from the user's existing file (appended to the file, not
 * overwriting anything they've customized) — otherwise updating the jar
 * after adding a new config/message key would silently leave existing
 * installs with that key resolving to "" forever, since the file only
 * gets created once.
 */
public final class PluginConfig {

  private final Properties props = new Properties();

  private PluginConfig() {}

  public static PluginConfig load(Path dataDirectory, Logger logger) throws IOException {
    if (!Files.exists(dataDirectory)) {
      Files.createDirectories(dataDirectory);
    }
    Path configFile = dataDirectory.resolve("config.properties");
    if (!Files.exists(configFile)) {
      logger.info("No config.properties found, writing defaults to " + configFile);
      try (InputStream in = openBundledDefaults()) {
        Files.copy(in, configFile);
      }
    }

    PluginConfig config = new PluginConfig();
    // Properties#load(InputStream) decodes as ISO-8859-1 by spec, which
    // mangles any non-ASCII character in a message template (em dashes,
    // arrows, etc.) — read as UTF-8 explicitly via the Reader overload.
    try (InputStream in = Files.newInputStream(configFile);
         InputStreamReader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
      config.props.load(reader);
    }

    mergeMissingKeys(configFile, config.props, logger);

    return config;
  }

  private static InputStream openBundledDefaults() throws IOException {
    InputStream in = PluginConfig.class.getClassLoader().getResourceAsStream("config.properties");
    if (in == null) {
      throw new IOException("Bundled default config.properties missing from jar");
    }
    return in;
  }

  private static void mergeMissingKeys(Path configFile, Properties existing, Logger logger) throws IOException {
    Properties defaults = new Properties();
    try (InputStream in = openBundledDefaults();
         InputStreamReader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
      defaults.load(reader);
    }

    List<String> missingLines = new ArrayList<>();
    for (String key : defaults.stringPropertyNames()) {
      if (!existing.containsKey(key)) {
        String value = defaults.getProperty(key);
        missingLines.add(key + "=" + value);
        existing.setProperty(key, value); // so this run picks it up too, not just future ones
      }
    }

    if (missingLines.isEmpty()) return;

    logger.info("Adding " + missingLines.size() + " new config key(s) introduced by a plugin update: "
        + String.join(", ", missingLines.stream().map(l -> l.split("=", 2)[0]).toList()));

    StringBuilder append = new StringBuilder();
    append.append("\n# --- new keys added automatically after a plugin update ---\n");
    for (String line : missingLines) {
      append.append(line).append('\n');
    }
    Files.write(configFile, append.toString().getBytes(StandardCharsets.UTF_8),
        StandardOpenOption.APPEND);
  }

  public String backendBaseUrl() {
    return trimTrailingSlash(require("backend.baseUrl"));
  }

  public String backendApiKey() {
    return require("backend.apiKey");
  }

  public String permissionNode() {
    return props.getProperty("permission.node", "customprefix.use");
  }

  public String bypassFilterPermissionNode() {
    return props.getProperty("permission.bypassFilter", "customprefix.bypassfilter");
  }

  public String adminAccessPermissionNode() {
    return props.getProperty("permission.adminAccess", "customprefix.admin");
  }

  public int prefixPriority() {
    return Integer.parseInt(props.getProperty("prefix.priority", "100"));
  }

  public int linkTtlMinutes() {
    return Integer.parseInt(props.getProperty("link.ttlMinutes", "20"));
  }

  public int pollIntervalSeconds() {
    return Integer.parseInt(props.getProperty("poll.intervalSeconds", "1"));
  }

  public int httpTimeoutSeconds() {
    return Integer.parseInt(props.getProperty("http.timeoutSeconds", "5"));
  }

  public String message(String key) {
    return props.getProperty(key, "");
  }

  private String require(String key) {
    String value = props.getProperty(key);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Missing required config key: " + key);
    }
    return value;
  }

  private static String trimTrailingSlash(String s) {
    return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
  }
}
