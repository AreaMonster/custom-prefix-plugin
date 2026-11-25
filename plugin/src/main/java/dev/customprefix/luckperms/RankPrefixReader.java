package dev.customprefix.luckperms;

import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import net.luckperms.api.model.user.User;

import java.util.Map;
import java.util.UUID;

/**
 * Reads a player's current rank prefix from LuckPerms so the website can
 * offer "start from my rank prefix" in the builder.
 *
 * "Rank prefix" means the highest-priority prefix the player has OTHER than
 * the one this plugin manages (at {@code excludedPriority}) — otherwise a
 * player who already made a custom prefix would just get their own custom
 * prefix back instead of the rank it sits on top of.
 */
public final class RankPrefixReader {

  private RankPrefixReader() {}

  /** @return the prefix string, or null if the player has none / LuckPerms can't answer. */
  public static String read(UUID playerUuid, int excludedPriority) {
    try {
      LuckPerms luckPerms = LuckPermsProvider.get();
      User user = luckPerms.getUserManager().getUser(playerUuid);
      if (user == null) {
        return null; // not loaded (shouldn't happen for an online player) — just skip it
      }

      Map<Integer, String> prefixes = user.getCachedData().getMetaData().getPrefixes();
      String best = null;
      int bestPriority = Integer.MIN_VALUE;
      for (Map.Entry<Integer, String> entry : prefixes.entrySet()) {
        if (entry.getKey() == excludedPriority) continue;
        if (entry.getKey() > bestPriority) {
          bestPriority = entry.getKey();
          best = entry.getValue();
        }
      }
      if (best == null || best.isBlank()) {
        return null;
      }
      // Some setups store the section sign form; the website only deals in '&'.
      return best.replace('§', '&');
    } catch (RuntimeException e) {
      // This is only a convenience pre-fill for the builder — never let it
      // get in the way of actually creating the link.
      return null;
    }
  }
}
