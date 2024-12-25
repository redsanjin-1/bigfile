export const MAX_FILE_SIZE = 1024 * 1024 * 200 // 文件大小限制200m
export const CHUNK_SIZE = 1024 * 1024 * 10 // 切片大小10m
export enum UPLOAD_STATUS { // 上传状态
  NOT_STARTED, // 未上传
  UPLOADING, // 上传中
  PAUSED, // 已暂停
}
export const MAX_RETRIES = 3 // 上传失败重试次数
// https://developer.mozilla.org/zh-CN/docs/Web/HTTP/MIME_types/Common_types
export const ALLOW_MEDIA_TYPE = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/x-ms-wmv',
  'video/x-msvideo',
] // 允许上传的文件类型
export const INDEXDB_NAME = 'file_upload_db' // indexedDB 数据库名称
