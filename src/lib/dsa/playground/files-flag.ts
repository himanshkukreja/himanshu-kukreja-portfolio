/**
 * Named Playground files and share links are off until the owner applies supabase/migrations/
 * 20261116_dsa_playground_files.sql and sets DSA_PLAYGROUND_FILES=on (server env). Import-free so pages can read it.
 */
export const PLAYGROUND_FILES_ON = (process.env.DSA_PLAYGROUND_FILES || "").trim().toLowerCase() === "on";
