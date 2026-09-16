package dev.customprefix;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

/**
 * Parses this plugin's own '&'-coded message templates (config.properties)
 * into Adventure Components. Only the standard 16 color codes + formatting
 * codes are needed here (that's all the bundled message templates use) —
 * player-authored prefix strings with '&#RRGGBB' hex are never rendered by
 * this plugin directly; LuckPerms/the game client render those wherever
 * chat is actually formatted.
 */
public final class Legacy {
  private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();

  private Legacy() {}

  public static Component parse(String text) {
    return SERIALIZER.deserialize(text == null ? "" : text);
  }
}
