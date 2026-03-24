export interface User {
  id: number;
  email: string;
  password: string;
  name?: string | null;
  phone?: string | null;
  discord_id?: string | null;
  discord_tag?: string | null;
  discord_username?: string | null;
  discord_verified?: boolean;
}
