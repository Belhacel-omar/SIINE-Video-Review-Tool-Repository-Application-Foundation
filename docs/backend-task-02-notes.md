# Backend Task 02 implementation notes

## XLSX dependency

Task 02 uses `@ayocore/exceljs@5.0.4`, a maintained Node 20+ server-side fork of ExcelJS. Upstream `exceljs@4.4.0` was not selected because current 2026 security reports identify unresolved vulnerable transitive dependencies in that release. The selected fork retains the ExcelJS XLSX API while updating/removing vulnerable and legacy runtime dependencies.

## Spreadsheet preservation

`videos.source_data` continues to preserve source values by original header name. Because PostgreSQL JSONB does not guarantee original object-key ordering as a source-format contract, Task 02 adds nullable `courses.import_metadata` containing:

- `headers`: original header names in source column order
- `worksheetName`: selected source worksheet
- `headerRowNumber`: original header row

Migration `0001_course_import_metadata.sql` is additive. Foundation migration `0000_data_auth_foundation.sql` is unchanged.

## Import choices

- Playlist order is zero-based. The first imported video has `playlist_order = 0`.
- The first valid Title + Bunny URL header pair is searched within the first 10 worksheets and first 10 rows.
- Required URL values must be valid HTTPS URLs; no Bunny hostname allowlist is imposed.
- Non-empty invalid rows fail the complete import.
- Upload bytes are parsed in memory and are not persisted as files.
- Import writes are contained in one database transaction. The owned Course row is locked before checking the import-once rule. Video inserts are batched at 1,000 rows inside the same transaction.
- Course/video ownership failures are returned as safe 404 responses to avoid exposing another user's resources.
