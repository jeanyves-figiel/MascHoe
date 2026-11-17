# F-08 Media & private albums

## Rules
- R-08.1 Public photos: see F-06 R-06.3 + F-15 classifier. Stored plaintext, AVIF, max 2048 px, EXIF/GPS stripped on device before upload.
- R-08.2 Chat media: photos (≤ 20 MB), videos (≤ 3 min, ≤ 200 MB, transcoded on device to H.265 1080p), voice notes (≤ 2 min). Encrypted on device (AES-256-GCM, random key), blob uploaded, key sent in MLS message.
- R-08.3 Options per send: view-once, expiry (1 h / 24 h / 7 d / keep), allow save (off by default).
- R-08.4 Private albums: unlimited albums/items; each album has its own key; **grant** = send album key E2EE to a person; **revoke** = rotate key, re-encrypt (lazy), receivers lose access on next sync; grant expiry optional.
- R-08.5 Viewer watermark (default on): invisible per-recipient watermark embedded on device before sending (robust to re-encode), enables leak attribution on report.
- R-08.6 Screenshot: Android FLAG_SECURE on media viewer; iOS detect → system message "X took a screenshot".
- R-08.7 Receiver blur: explicit classifier runs **on receiver device**; if explicit and sender not replied-to (or Settings = blur always) → blurred with "Tap to view".
- R-08.8 CSAM/minor safety: on-device classifier + hash match before **sending**; positive → blocked, user warned; nothing sent to server except a counter (no content). Repeated → account review.
- R-08.9 Album UI (S-41): grid of albums, per-album "Shared with" list, add/revoke, expiry.
- R-08.10 Storage: blobs deleted when all recipients acked + expiry, or 30 d undelivered.

## Acceptance criteria
- AC-08.1 Uploaded public photos contain no EXIF.
- AC-08.2 Revoked album not decryptable by revoked device after next sync (test).
- AC-08.3 View-once media cannot be reopened after close (local file wiped).
