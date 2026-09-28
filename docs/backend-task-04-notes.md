# Backend Task 04 implementation notes

Task 04 reconstructs the reviewed XLSX from the authoritative database only.

- `courses.import_metadata.headers` defines the exact original header order.
- `courses.import_metadata.worksheetName` defines the reconstructed worksheet name.
- `courses.import_metadata.headerRowNumber` defines the header row position.
- `videos.source_row_number` defines each reconstructed source row position.
- `videos.source_data[header]` provides original imported source values.
- only the authenticated user's joined review is considered.
- `Reviewer Note` is appended exactly once as the final column.
- a note is exported only when `reviewed_at IS NOT NULL`.
- export is allowed before all videos are reviewed.
- no original uploaded workbook binary is required or retained.
- V1 does not reconstruct styles, formulas, comments, images, macros, merged cells, or workbook metadata.
- XLSX generation is in memory using the existing `@ayocore/exceljs@5.0.4`.
