package dev.customprefix;

import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.proxy.Player;
import dev.customprefix.backend.SessionCreateResult;
import dev.customprefix.luckperms.PrefixApplier;
import dev.customprefix.luckperms.RankPrefixReader;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;

import java.util.List;
import java.util.Locale;
import java.util.logging.Level;

/**
 * Proxy-level '/prefix' command — registered on Velocity so it works for a
 * player no matter which backend Paper server they're currently on.
 *
 * Subcommands:
 *   /prefix [create]  — generate a personal link to design a new prefix
 *   /prefix remove     — clear the custom prefix immediately, no website
 *                         involved (it's a direct LuckPerms operation)
 *   /prefix admin       — send a short-lived, single-use link straight
 *                         into the admin audit log page, no username/
 *                         password needed. Gated by its own permission,
 *                         independent of the other two.
 */
public final class PrefixCommand implements SimpleCommand {

  private final CustomPrefixPlugin plugin;

  public PrefixCommand(CustomPrefixPlugin plugin) {
    this.plugin = plugin;
  }

  @Override
  public void execute(Invocation invocation) {
    if (!(invocation.source() instanceof Player player)) {
      invocation.source().sendMessage(Legacy.parse(plugin.pluginConfig().message("message.playersOnly")));
      return;
    }

    String[] args = invocation.arguments();
    String sub = args.length > 0 ? args[0].toLowerCase(Locale.ROOT) : "create";

    switch (sub) {
      case "admin":
        handleAdminAccess(player);
        break;
      case "remove":
      case "delete":
      case "clear":
        if (requirePermission(player, plugin.pluginConfig().permissionNode())) {
          handleRemove(player);
        }
        break;
      case "create":
        if (requirePermission(player, plugin.pluginConfig().permissionNode())) {
          handleCreate(player);
        }
        break;
      default:
        player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.usage")));
    }
  }

  private boolean requirePermission(Player player, String node) {
    if (!player.hasPermission(node)) {
      player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.noPermission")));
      return false;
    }
    return true;
  }

  private void handleCreate(Player player) {
    boolean hadPrevious = plugin.cancelActivePoller(player.getUniqueId());
    boolean bypassFilter = player.hasPermission(plugin.pluginConfig().bypassFilterPermissionNode());
    String rankPrefix = RankPrefixReader.read(player.getUniqueId(), plugin.pluginConfig().prefixPriority());

    plugin.backendClient().createSession(player.getUniqueId(), player.getUsername(), bypassFilter, rankPrefix)
        .thenAccept(result -> {
          String key = hadPrevious ? "message.alreadyPending" : "message.linkSent";
          player.sendMessage(buildLinkMessage(plugin.pluginConfig().message(key), result, true));
          plugin.startPoller(player, result.token());
        })
        .exceptionally(err -> {
          player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.backendUnreachable")));
          // Log the throwable itself (not just its message) so java.util.logging
          // prints a full stack trace — needed to diagnose network-layer
          // failures like DNS/connect issues that don't carry a useful message.
          plugin.logger().log(Level.WARNING,
              "Failed to create session for " + player.getUsername(), err);
          return null;
        });
  }

  private void handleRemove(Player player) {
    // Cancel any in-progress "create" flow so a pending link can't
    // re-apply a prefix right after the player just asked to clear it.
    plugin.cancelActivePoller(player.getUniqueId());

    int priority = plugin.pluginConfig().prefixPriority();
    PrefixApplier.apply(player.getUniqueId(), "", priority)
        .thenRun(() -> {
          if (player.isActive()) {
            player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.removed")));
          }
        })
        .exceptionally(err -> {
          if (player.isActive()) {
            player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.removeFailed")));
          }
          plugin.logger().log(Level.WARNING,
              "Failed to remove prefix for " + player.getUsername(), err);
          return null;
        });
  }

  private void handleAdminAccess(Player player) {
    if (!player.hasPermission(plugin.pluginConfig().adminAccessPermissionNode())) {
      player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.adminNoPermission")));
      return;
    }

    plugin.backendClient().requestAdminLink(player.getUniqueId(), player.getUsername())
        .thenAccept(result ->
            player.sendMessage(buildLinkMessage(plugin.pluginConfig().message("message.adminLinkSent"), result, false)))
        .exceptionally(err -> {
          player.sendMessage(Legacy.parse(plugin.pluginConfig().message("message.backendUnreachable")));
          plugin.logger().log(Level.WARNING,
              "Failed to create admin link for " + player.getUsername(), err);
          return null;
        });
  }

  @Override
  public boolean hasPermission(Invocation invocation) {
    // We do our own permission check in execute() so we can send a
    // friendlier configured message instead of Velocity's default.
    return true;
  }

  @Override
  public List<String> suggest(Invocation invocation) {
    if (invocation.arguments().length <= 1) {
      return List.of("create", "remove", "admin");
    }
    return List.of();
  }

  /**
   * @param showRawUrl also print the URL itself on a second line. Not every
   *     client can click a chat link (web links disabled in chat settings,
   *     Bedrock players joining through Geyser, ...), and without the text
   *     there'd be nothing to copy. Left off for the single-use admin link,
   *     which shouldn't sit around as readable text in chat/screenshots.
   */
  private Component buildLinkMessage(String template, SessionCreateResult result, boolean showRawUrl) {
    // Derived from the link's actual expiresAt rather than any local
    // config value — correct regardless of which endpoint issued it
    // (player links default to 20 min, admin links are a fixed 10 min on
    // the website side) without needing two TTLs kept in sync by hand.
    long minutesLeft = Math.max(1, Math.round((result.expiresAt() - System.currentTimeMillis()) / 60000.0));
    String text = template.replace("{ttl}", String.valueOf(minutesLeft)).replace("{url}", "");

    Component link = Component.text("[Click here to open]")
        .color(NamedTextColor.AQUA)
        .decorate(TextDecoration.UNDERLINED)
        .clickEvent(ClickEvent.openUrl(result.url()))
        .hoverEvent(HoverEvent.showText(Component.text(result.url())));

    Component message = Legacy.parse(text).append(link);
    if (showRawUrl) {
      message = message.append(Component.newline()).append(
          Component.text(result.url())
              .color(NamedTextColor.GRAY)
              .clickEvent(ClickEvent.openUrl(result.url())));
    }
    return message;
  }
}
