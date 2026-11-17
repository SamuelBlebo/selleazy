/**
 * Photos and videos merchants attach to promotions. Limits are WhatsApp
 * Cloud API's: images JPEG/PNG up to 5 MB, videos MP4/3GPP up to 16 MB.
 * Mirrored in storage.rules and web/src/services (uploadBroadcastMedia).
 */
export type MediaType = 'image' | 'video';

export const MEDIA_LIMITS: Record<MediaType, { types: string[]; maxBytes: number }> = {
  image: { types: ['image/jpeg', 'image/png'], maxBytes: 5 * 1024 * 1024 },
  video: { types: ['video/mp4', 'video/3gpp'], maxBytes: 16 * 1024 * 1024 },
};

/** Where a business's promotion files live. The server only sends files under this folder. */
export const broadcastMediaPrefix = (orgId: string) => `organizations/${orgId}/broadcasts/`;

/** Why a stored file can't go out on WhatsApp, or null when it can. */
export function mediaProblem(
  orgId: string,
  media: { type: MediaType; path: string },
  file: { contentType: string | undefined; size: number } | null,
): string | null {
  if (!media.path.startsWith(broadcastMediaPrefix(orgId)) || media.path.includes('..')) return 'That file does not belong to this business.';
  if (!file) return 'The file did not finish uploading. Attach it again.';
  const limit = MEDIA_LIMITS[media.type];
  if (!file.contentType || !limit.types.includes(file.contentType)) {
    return media.type === 'image' ? 'Use a JPEG or PNG photo.' : 'Use an MP4 video.';
  }
  if (file.size > limit.maxBytes) return media.type === 'image' ? 'Photos must be under 5 MB.' : 'Videos must be under 16 MB.';
  return null;
}
