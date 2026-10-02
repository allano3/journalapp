# Sync (not in v1)

v1 ships plain exports (`export.ts`) and encrypted backup/restore (`backup.ts`) only. The
data model was laid out so an end-to-end encrypted sync can be added without redesign:

- Every row has a globally unique, time-sortable id (`domain/ids.ts`) and `created_at` /
  `updated_at` timestamps. Conviction history is append-only, so versions never conflict.
- Deletions are recorded in `tombstones(table_name, row_id, deleted_at)`.
- Blocks belong to exactly one entry; embeddings and AI artifacts are derived and are
  never synced (each device rebuilds them locally).

Planned mechanism: each device periodically produces a *change bundle* — all rows with
`updated_at` after the last sync cursor plus tombstones — encrypts it with the same
passphrase-derived key used for backups (AES-256-GCM, PBKDF2) and places the ciphertext
in a dumb store the user controls (a folder in iCloud Drive / Dropbox / Syncthing, or a
WebDAV path). Peers download bundles they have not seen, decrypt locally, and apply with
last-writer-wins by `updated_at` per row (per block, not per entry, so concurrent edits
to different sections merge cleanly). The transport never sees plaintext and no server
component is required.
