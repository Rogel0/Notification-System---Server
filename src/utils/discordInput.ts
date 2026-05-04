export type DiscordNormalized = {
  discordId: string | null;
  discordTag: string | null;
  discordUsername: string | null;
};

export function normalizeDiscordInput(
  value: string | null | undefined,
): DiscordNormalized {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      discordId: null,
      discordTag: null,
      discordUsername: null,
    };
  }

  // Discord user mention forms like <@123...> or <@!123...>
  const mentionMatch = raw.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch) {
    return {
      discordId: mentionMatch[1],
      discordTag: null,
      discordUsername: null,
    };
  }

  // Full discord snowflake ID (usually 17-20 digits)
  if (/^\d{17,20}$/.test(raw)) {
    return {
      discordId: raw,
      discordTag: null,
      discordUsername: null,
    };
  }

  // Numeric-only non-snowflake input (e.g. 0026204) should be preserved
  // as a single tag candidate for downstream resolver logic.
  if (/^\d{5,16}$/.test(raw)) {
    return {
      discordId: null,
      discordTag: raw,
      discordUsername: null,
    };
  }

  // If input contains #, treat as username#discriminator
  const clean = raw.replace(/^#+/, "");
  if (clean.includes("#")) {
    const [userPart, discPart] = clean.split("#", 2);
    const username = userPart.trim().replace(/\s+/g, "");
    const discriminator = String(discPart || "")
      .replace(/\D/g, "")
      .padStart(4, "0")
      .slice(-4);
    if (username && /^[0-9]{4}$/.test(discriminator)) {
      // store tag as digits only; callers should combine when needed: username#tag
      return {
        discordId: null,
        discordTag: discriminator,
        discordUsername: username,
      };
    }
  }

  // Plain username-only input should stay intact.
  // This supports modern Discord usernames like `juneee2401` that do not use
  // the legacy `name#1234` discriminator format.
  const usernameOnly = raw.trim().replace(/\s+/g, "");
  if (usernameOnly && usernameOnly.length <= 32) {
    return {
      discordId: null,
      discordTag: null,
      discordUsername: usernameOnly,
    };
  }

  // fallback: not parseable
  return {
    discordId: null,
    discordTag: null,
    discordUsername: null,
  };
}
