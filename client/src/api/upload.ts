import { AxiosProgressEvent, CancelTokenSource } from 'axios'
import { axiosInstance } from './http'

export type BaseResType = {
  success: boolean // 请求是否成功
}
export type VerifyFileRes = {
  needUpload: boolean // 是否需要继续上传
  uploadedChunkList: UploadedChunkType[] // 已经上传的切片列表
} & BaseResType
export type UploadedChunkType = {
  chunkFileName: string
  size: number
}
export type UploadProgressType = Record<string, number>

/**
 * 检验文件是否已经上传过
 * @param fileName 文件名
 * @returns
 */
export function verifyFile(fileName: string) {
  return axiosInstance.get<any, VerifyFileRes>(`/verify/${fileName}`)
}

/**
 * 发送上传切片请求
 * @param filename 文件名
 * @param chunkFileName 切片名
 * @param chunk 切片流
 * @param setUploadProgress 设置上传进度方法
 * @param cancelToken 取消上传token
 * @param start 切片起始字节位置
 * @param totalSize 文件总字节数
 * @returns
 */
export function createUploadRequest(
  filename: string,
  chunkFileName: string,
  chunk: Blob,
  setUploadProgress: Function,
  cancelToken: CancelTokenSource,
  start: number,
  totalSize: number
) {
  return axiosInstance.post<any, BaseResType>(`/upload/${filename}`, chunk, {
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    params: {
      chunkFileName,
      start, // 写入文件的起始位置
    },
    onUploadProgress: (event: AxiosProgressEvent) => {
      // 用已上传的字节数 + 上次上传成功字节数 / 总字节数
      const percentCompleted = Math.round(
        ((event.loaded + start) * 100) / totalSize
      )
      setUploadProgress((preProgress: UploadProgressType) => ({
        ...preProgress,
        [chunkFileName]: percentCompleted,
      }))
    },
    cancelToken: cancelToken.token,
  })
}

/**
 * 上传完成，合并文件
 * @param fileName 文件名
 * @returns
 */
export function mergeFile(fileName: string) {
  return axiosInstance.get<any, BaseResType>(`/merge/${fileName}`)
}
