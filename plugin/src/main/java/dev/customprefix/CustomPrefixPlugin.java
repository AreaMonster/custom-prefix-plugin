package dev.customprefix;

import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.DisconnectEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.scheduler.ScheduledTask;
import dev.customprefix.backend.BackendClient;
import dev.customprefix.config.PluginConfig;
import dev.customprefix.polling.SessionPoller;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

// NOTE: velocity-plugin.json (src/main/resources) is the authoritative
// plugin descriptor Velocity actually reads. It's authored by hand rather
// than relying on this @Plugin annotation's bundled annotation processor,
// which did not reliably generate the descriptor in testing on this
// toolchain — keep the two in sync if you change id/name/version here.
@Plugin(
    id = "custom-prefix-plugin",
    name = "CustomPrefixPlugin",
    version = "1.0.0",
    description = "Syncs web-designed LuckPerms prefixes to players.",
    authors = {"you"}
)
public final class CustomPrefixPlugin {

  private final ProxyServer server;
  private final Logger logger;
  private final Path dataDirectory;

  private PluginConfig config;
  private BackendClient backendClient;
  private final Map<UUID, SessionPoller> activePollers = new ConcurrentHashMap<>();

  @Inject
  public CustomPrefixPlugin(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
    this.server = server;
    this.logger = logger;
    this.dataDirectory = dataDirectory;
  }

  @Subscribe
  public void onProxyInitialize(ProxyInitializeEvent event) {
    try {
      config = PluginConfig.load(dataDirectory, logger);
    } catch (IOException e) {
      logger.log(Level.SEVERE, "Failed to load config.properties — plugin will not function.", e);
      return;
    }
    backendClient = new BackendClient(config);

    var meta = server.getCommandManager().metaBuilder("prefix").plugin(this).build();
    server.getCommandManager().register(meta, new PrefixCommand(this));

    logger.info("CustomPrefixPlugin enabled. Backend: " + config.backendBaseUrl());
  }

  @Subscribe
  public void onDisconnect(DisconnectEvent event) {
    SessionPoller poller = activePollers.remove(event.getPlayer().getUniqueId());
    // The poller's own stop() also cancels its ScheduledTask; removing it
    // here just stops it from being tracked as "active" any further.
  }

  /**
   * Cancels any poller already running for this player (e.g. they ran
   * /prefix again before finishing). Returns true if one was cancelled.
   */
  public boolean cancelActivePoller(UUID uuid) {
    SessionPoller previous = activePollers.remove(uuid);
    return previous != null;
  }

  public void startPoller(Player player, String token) {
    long hardDeadline = System.currentTimeMillis() + (config.linkTtlMinutes() * 60_000L);
    SessionPoller poller = new SessionPoller(this, player, token, hardDeadline);
    ScheduledTask task = server.getScheduler()
        .buildTask(this, poller)
        .delay(config.pollIntervalSeconds(), TimeUnit.SECONDS)
        .repeat(config.pollIntervalSeconds(), TimeUnit.SECONDS)
        .schedule();
    poller.setTask(task);
    activePollers.put(player.getUniqueId(), poller);
  }

  /** Called by a SessionPoller once it's done; only clears the map entry if it's still the current poller. */
  public void stopPoller(UUID uuid, SessionPoller self) {
    activePollers.remove(uuid, self);
  }

  public PluginConfig pluginConfig() {
    return config;
  }

  public BackendClient backendClient() {
    return backendClient;
  }

  public Logger logger() {
    return logger;
  }

  public ProxyServer server() {
    return server;
  }
}
