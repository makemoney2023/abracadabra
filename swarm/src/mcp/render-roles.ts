/** Tool names for one render job. Templates share these arrays. */
export const RENDER_ROLES = {
  still: ['search_models', 'muapi_image_generate', 'muapi_image_edit', 'muapi_predict_result'],
  animate: ['muapi_video_from_image', 'muapi_video_generate', 'muapi_predict_result'],
  edit: ['muapi_image_edit', 'muapi_predict_result'],
  upscale: ['muapi_enhance_upscale', 'muapi_predict_result'],
  cutout: ['muapi_enhance_bg_remove', 'muapi_predict_result'],
  sound: ['muapi_audio_create', 'muapi_audio_from_text', 'muapi_predict_result'],
  lipsync: ['muapi_edit_lipsync', 'muapi_predict_result'],
  clip: ['muapi_edit_clipping', 'muapi_predict_result'],
  poll: ['muapi_predict_result'],
} as const;

export type RenderRole = keyof typeof RENDER_ROLES;
