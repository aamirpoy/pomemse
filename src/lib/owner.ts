export const OWNER_EMAIL = "aamirali047@gmail.com";
export const OWNER_ID = "a801c15f-9272-4a76-9832-1e774f162da0";
// UI-only hint; server checks use OWNER_ID.
export const isOwnerEmail = (email?: string | null) =>
  !!email && email.trim().toLowerCase() === OWNER_EMAIL;
export const isOwnerId = (id?: string | null) => id === OWNER_ID;
