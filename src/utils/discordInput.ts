export type DiscordNormalized = {
  discordId: string | null;
  discordTag: string | null;
  discordUsername: string | null;
};

export function normalizeDiscordInput(value: string | null | undefined): DiscordNormalized {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      discordId: null,
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
    const discriminator = String(discPart || "").replace(/\D/g, "").padStart(4, "0").slice(-4);
    if (username && /^[0-9]{4}$/.test(discriminator)) {
      // store tag as digits only; callers should combine when needed: username#tag
      return {
        discordId: null,
        discordTag: discriminator,
        discordUsername: username,
      };
    }
  }

  // Plain username + 4 digits (e.g. 0026204 => 002#6204 or unnamed6204 => unnamed#6204)
  const match = raw.match(/^(.+?)(\d{4})$/);
  if (match) {
    const usernamePart = match[1].trim().replace(/\s+/g, "");
    const discriminatorPart = match[2];
    if (usernamePart && usernamePart.length <= 32) {
      return {
        discordId: null,
        discordTag: discriminatorPart,
        discordUsername: usernamePart,
      };
    }
  }

  // Plain username-only (no discriminator) fallback: persist username
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

