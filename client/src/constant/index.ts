export const MAX_FILE_SIZE = 1024 * 1024 * 200 // 文件大小限制200m
export const CHUNK_SIZE = 1024 * 1024 * 10 // 切片大小10m
export enum UPLOAD_STATUS { // 上传状态
  NOT_STARTED, // 未上传
  UPLOADING, // 上传中
  PAUSED, // 已暂停
}
