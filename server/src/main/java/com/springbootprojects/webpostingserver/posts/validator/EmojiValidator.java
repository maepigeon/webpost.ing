package com.springbootprojects.webpostingserver.posts.validator;

import java.util.Set;

/**
 * Allowlist-based emoji validator for post and comment reactions.
 * The set must stay in sync with the frontend REACTION_EMOJIS constants.
 */
public class EmojiValidator {

    public static final Set<String> ALLOWED = Set.of(
        "👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "😍", "🤔", "👏", "💯", "🙏", "😅", "🥹", "🫡"
    );

    public static boolean isValid(String emoji) {
        return emoji != null && ALLOWED.contains(emoji.trim());
    }
}
