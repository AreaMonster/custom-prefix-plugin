package dev.customprefix.luckperms;

import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import net.luckperms.api.model.user.User;
import net.luckperms.api.model.user.UserManager;
import net.luckperms.api.node.NodeType;
import net.luckperms.api.node.types.PrefixNode;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Applies a saved prefix string to a player via the real LuckPerms API —
 * never by shelling out to '/lp' console commands, so there is no command
 * injection surface regardless of what's in the (already server-side
 * validated) prefix string.
 *
 * Only prefix nodes at exactly {@code priority} are ever removed/replaced,
 * so rank-based prefixes an admin has set at other priorities are left
 * untouched.
 *
 * NOTE for implementers: NodeType.PREFIX is used here based on the
 * LuckPerms API source (PrefixNode#getType() returns NodeType.PREFIX).
 * If this constant doesn't compile against the LuckPerms API version you
 * pin in pom.xml, fall back to filtering
 * `user.data().toCollection().stream().filter(n -> n instanceof PrefixNode)`.
 */
public final class PrefixApplier {

  private PrefixApplier() {}

  /**
   * @param prefixString already validated by the backend; an empty string
   *                      means "remove the custom prefix, add nothing back".
   */
  public static CompletableFuture<Void> apply(UUID playerUuid, String prefixString, int priority) {
    LuckPerms luckPerms;
    try {
      luckPerms = LuckPermsProvider.get();
    } catch (IllegalStateException e) {
      return CompletableFuture.failedFuture(
          new IllegalStateException("LuckPerms is not loaded on this proxy", e));
    }

    UserManager userManager = luckPerms.getUserManager();
    return userManager.modifyUser(playerUuid, user -> {
      for (PrefixNode existing : user.getNodes(NodeType.PREFIX)) {
        if (existing.getPriority() == priority) {
          user.data().remove(existing);
        }
      }
      if (!prefixString.isEmpty()) {
        user.data().add(PrefixNode.builder(prefixString, priority).build());
      }
    });
  }
}
