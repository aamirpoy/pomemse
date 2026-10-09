export const OWNER_EMAIL = "aamirali047@gmail.com";
export const isOwnerEmail = (email?: string | null) =>
  !!email && email.trim().toLowerCase() === OWNER_EMAIL;
