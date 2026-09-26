# Backend API Contract V1

All future course/video/review endpoints require the reusable server-side authenticated-user guard. Errors use `{"error":{"code":"...","message":"..."}}` and never expose internals.

## Implemented auth
- POST /api/auth/login — body { email, password }; success { authenticated:true }; invalid credentials are generic.
- POST /api/auth/logout — clears and invalidates the current opaque server session.
- GET /api/auth/session — { authenticated:true,user:{id,email} } or 401 unauthenticated.
- PATCH /api/account/password — body { currentPassword,newPassword }; invalidates all sessions after success and requires login again.

## Frozen proposal for dependent tasks
- GET /api/courses -> { courses:[{id,title,originalFilename,createdAt,updatedAt}] }
- POST /api/courses body {title} -> {course:{id,title,...}}
- GET /api/courses/:courseId -> {course:{id,title,originalFilename,createdAt,updatedAt}}
- POST /api/courses/:courseId/import multipart XLSX -> {courseId,importedCount}; source_row_number and optional source_video_id preserve source identity.
- GET /api/courses/:courseId/videos -> {videos:[{id,courseId,sourceRowNumber,sourceVideoId,title,bunnyUrl,playlistOrder,review:{note,wasPlayed,reviewedAt}|null}]}
- GET /api/videos/:videoId -> {video:{id,courseId,title,bunnyUrl,playlistOrder,review}}
- PUT /api/videos/:videoId/review body {note:string|null,wasPlayed:boolean} -> {review:{videoId,note,wasPlayed,reviewedAt}}. Later task applies the approved reviewed_at rule.
- GET /api/courses/:courseId/export -> XLSX binary response preserving original columns and adding Reviewer Note.

Authoritative identities are UUID course.id and video.id; titles are never identity. Expected errors include UNAUTHORIZED(401), INVALID_REQUEST(400), NOT_FOUND(404), CONFLICT(409), INTERNAL_ERROR(500).
