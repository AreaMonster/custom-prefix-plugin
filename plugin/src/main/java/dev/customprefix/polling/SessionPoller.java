package dev.customprefix.polling;

import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.scheduler.ScheduledTask;
import dev.customprefix.CustomPrefixPlugin;
import dev.customprefix.Legacy;
import dev.customprefix.backend.BackendException;
import dev.customprefix.backend.SessionStatus;
import dev.customprefix.luckperms.PrefixApplier;

import java.util.concurrent.CompletionException;
import java.util.logging.Level;

/**
 * Polls the backend for one player's session until it's ready, expires, or
 * the plugin-side hard deadline passes (a belt-and-suspenders backstop in
 * case the backend is unreachable for the whole link window).
 */
public final class SessionPoller implements Runnable {

  private final CustomPrefixPlugin plugin;
  private final Player player;
  private final String token;
  private final long hardDeadlineMillis;

  private ScheduledTask selfTask;
  private volatile boolean stopped = false;

  public SessionPoller(CustomPrefixPlugin plugin, Player player, String token, long hardDeadlineMillis) {
    this.plugin = plugin;
    this.player = player;
    this.token = token;
    this.hardDeadlineMillis = hardDeadlineMillis;
  }

  public void setTask(ScheduledTask task) {
    this.selfTask = task;
  }

  @Override
  public void run() {
    if (stopped) return;

    if (System.currentTimeMillis() > hardDeadlineMillis) {
      notifyExpiredOnce();
      stop();
      return;
    }
    if (!player.isActive()) {
      // Player disconnected; DisconnectEvent should have already stopped
      // us, but guard against a race.
      stop();
      return;
    }

    plugin.backendClient().getStatus(token).whenComplete((status, err) -> {
      if (stopped) return;
      if (err != null) {
        handleError(err);
        return;
      }
      handleStatus(status);
    });
  }

  private void handleStatus(SessionStatus status) {
    if (status.isReady()) {
      int priority = plugin.pluginConfig().prefixPriority();
      PrefixApplier.apply(player.getUniqueId(), status.prefixString(), priority)
          .whenComplete((v, applyErr) -> {
            if (applyErr != null) {
              plugin.logger().log(Level.WARNING,
                  "Failed to apply prefix for " + player.getUsername(), applyErr);
              // Leave the poller running — next tick will see the same
              // 'ready' status and we'll retry the apply.
              return;
            }
            plugin.backendClient().ack(token).exceptionally(ackErr -> {
              plugin.logger().log(Level.FINE, "ack() failed (session likely already swept): " + ackErr.getMessage());
              return null;
            });
            if (player.isActive()) {
              player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.applied")));
            }
            stop();
          });
      return;
    }
    // status is "pending" (or an unexpected value) — keep polling silently.
  }

  private void handleError(Throwable err) {
    Throwable cause = err instanceof CompletionException ? err.getCause() : err;
    if (cause instanceof BackendException be && be.isGone()) {
      notifyExpiredOnce();
      stop();
      return;
    }
    // Transient network/backend error — tolerate it and try again next
    // tick; the hard deadline check at the top of run() is the real
    // backstop against an indefinitely-down backend.
    plugin.logger().log(Level.FINE, "Transient error polling session " + token + ": " + cause.getMessage());
  }

  private void notifyExpiredOnce() {
    if (player.isActive()) {
      player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.expired")));
    }
  }

  private void stop() {
    stopped = true;
    if (selfTask != null) {
      selfTask.cancel();
    }
    plugin.stopPoller(player.getUniqueId(), this);
  }
}
