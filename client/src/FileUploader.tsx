import { useEffect, useRef, useState } from 'react'
import { InboxOutlined } from '@ant-design/icons'
import { Button, App, theme, Progress, Space, Spin } from 'antd'
import { MessageInstance } from 'antd/es/message/interface'
import axios, { CancelTokenSource } from 'axios'
import localforage from 'localforage'
// import { getFileName } from './utils'
import {
  CHUNK_SIZE,
  UPLOAD_STATUS,
  MAX_RETRIES,
  INDEXDB_NAME,
} from './constant'
import useDrag, { FilePreviewType } from './hooks/useDrag'
import {
  verifyFile,
  mergeFile,
  createUploadRequest,
  UploadProgressType,
  UploadedChunkType,
  FileChunkType,
} from './api'
import './FileUploader.css'

function FileUploader() {
  const { message } = App.useApp()
  const uploadContainerRef = useRef<HTMLDivElement>(null)
  const [uploadStatus, setUploadStatus] = useState(UPLOAD_STATUS.NOT_STARTED)
  const { filePreview, selectedFile, resetFileStatus, setSelectFile } = useDrag(
    uploadContainerRef,
    uploadStatus
  )
  // 获取 indexDB 上传文件数据
  useEffect(() => {
    // 配置 indexDB
    localforage.config({
      name: INDEXDB_NAME,
    })
    localforage.keys().then((keys) => {
      console.log('indexdb keys', keys)
      keys
        .filter((key) => key.startsWith(INDEXDB_NAME))
        .map((key) => {
          if (!key.endsWith('_chunks')) {
            localforage.getItem(key).then((file) => {
              setSelectFile(file as File)
            })
          }
        })
    })
  }, [])
  // web worker
  const [filenameWorker, setFileNameWorker] = useState<Worker>()
  const [isCalculatingFilename, setIsCalculatingFilename] = useState(false)
  useEffect(() => {
    const fnworker = new Worker('/filenameWorker.js')
    setFileNameWorker(fnworker)
  }, [])

  // 上传进度条
  const [uploadProgress, setUploadProgress] = useState<UploadProgressType>({})
  // 上传请求的取消 token
  const [cancelTokens, setCancelTokens] = useState<CancelTokenSource[]>([])
  const pauseUpload = () => {
    setUploadStatus(UPLOAD_STATUS.PAUSED)
    cancelTokens.forEach((cancelToken) =>
      cancelToken.cancel('用户主动暂停上传')
    )
  }
  const renderButton = () => {
    switch (uploadStatus) {
      case UPLOAD_STATUS.NOT_STARTED:
        return (
          <Button type="primary" onClick={handleUpload}>
            上传
          </Button>
        )
      case UPLOAD_STATUS.UPLOADING:
        return (
          <Button type="primary" onClick={pauseUpload}>
            暂停
          </Button>
        )
      case UPLOAD_STATUS.PAUSED:
        return (
          <Button type="primary" onClick={handleUpload}>
            恢复
          </Button>
        )
    }
  }
  const renderProgress = () => {
    if (uploadStatus === UPLOAD_STATUS.NOT_STARTED) return null
    let totalProgress = renderTotalProgress()
    let chunkProgress = Object.keys(uploadProgress).map(
      (chunkName: string, index: number) => {
        return (
          <div key={chunkName}>
            <span>切片{index}：</span>
            <Progress percent={uploadProgress[chunkName]}></Progress>
          </div>
        )
      }
    )

    return (
      <>
        {totalProgress}
        {chunkProgress}
      </>
    )
  }
  const renderTotalProgress = () => {
    const percents = Object.values(uploadProgress)
    const totalPercent = Math.round(
      percents.reduce((acc, curr) => acc + curr, 0) / percents.length
    )

    return (
      <div>
        <span>总进度：</span>
        <Progress percent={totalPercent}></Progress>
      </div>
    )
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      message.error('未选择文件')
      return
    }
    setUploadStatus(UPLOAD_STATUS.UPLOADING)
    const dbKeys = await localforage.keys()
    // 本地有文件未上传完
    if (dbKeys.length > 0) {
      dbKeys
        .filter((key) => key.startsWith(INDEXDB_NAME))
        .map((key) => {
          if (!key.endsWith('_chunks')) {
            const filename = key.replace(INDEXDB_NAME + '_', '')
            console.log('reupload', filename)
            uploadFile(
              filename,
              message,
              setUploadProgress,
              resetAllStatus,
              setCancelTokens
            )
          }
        })
    } else {
      if (!filenameWorker) {
        return
      }
      filenameWorker.postMessage(selectedFile)
      setIsCalculatingFilename(true)
      filenameWorker.onmessage = async (event) => {
        console.log('filename from worker', event.data)
        setIsCalculatingFilename(false)
        await createFileChunks(selectedFile, event.data)
        await uploadFile(
          event.data,
          message,
          setUploadProgress,
          resetAllStatus,
          setCancelTokens
        )
      }
    }
  }
  const resetAllStatus = () => {
    resetFileStatus()
    setUploadProgress({})
    setUploadStatus(UPLOAD_STATUS.NOT_STARTED)
  }

  return (
    <Spin spinning={isCalculatingFilename} tip="正在计算文件名...">
      <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
        <div
          className="upload-container"
          ref={uploadContainerRef}
          style={getContainerStyle()}
        >
          {renderFilePreview(filePreview)}
        </div>
        {renderButton()}
        {renderProgress()}
      </Space>
    </Spin>
  )
}

/**
 *获取容器样式，基于antd的token自适应系统主题
 * @returns
 */
function getContainerStyle() {
  const { useToken } = theme
  const { token } = useToken()
  return {
    backgroundColor: token.colorFillAlter,
    borderColor: token.colorBorder,
  }
}

/**
 * 实现切片上传
 * @param filename 文件名
 */
async function uploadFile(
  filename: string,
  message: MessageInstance,
  setUploadProgress: Function,
  resetAllStatus: Function,
  setCancelTokens: Function,
  retryCount = 0
) {
  const { needUpload, uploadedChunkList } = await verifyFile(filename)
  if (!needUpload) {
    message.success('文件已存在，秒传成功')
    await removeIndexDBFileInfo()
    return resetAllStatus()
  }
  // 生成切片
  const chunks = await getFileChunks(filename)
  const newCancelTokens: CancelTokenSource[] = []
  const requests = (chunks || []).map(({ chunk, chunkFileName }) => {
    const cancelToken = axios.CancelToken.source()
    newCancelTokens.push(cancelToken)
    const existingChunk = uploadedChunkList.find(
      (uploadedChunk: UploadedChunkType) => {
        return uploadedChunk.chunkFileName === chunkFileName
      }
    )
    // 此分片已经上传了一部分，或者已经完全上传
    if (existingChunk) {
      const uploadedSize = existingChunk.size
      const remainingChunk = chunk.slice(uploadedSize)
      // 已经完全上传
      if (remainingChunk.size === 0) {
        setUploadProgress((preProgress: UploadProgressType) => ({
          ...preProgress,
          [chunkFileName]: 100,
        }))
        return Promise.resolve()
      }
      setUploadProgress((preProgress: UploadProgressType) => ({
        ...preProgress,
        [chunkFileName]: (uploadedSize * 100) / chunk.size,
      }))

      return createUploadRequest(
        filename,
        chunkFileName,
        remainingChunk,
        setUploadProgress,
        cancelToken,
        uploadedSize,
        chunk.size
      )
    } else {
      return createUploadRequest(
        filename,
        chunkFileName,
        chunk,
        setUploadProgress,
        cancelToken,
        0,
        chunk.size
      )
    }
  })
  setCancelTokens(newCancelTokens)
  try {
    // 并行上传每个分片
    await Promise.all(requests)
    // 合并分片
    await mergeFile(filename)
    await message.success('上传成功')
    await removeIndexDBFileInfo()
    resetAllStatus()
  } catch (error) {
    // 用户主动点击暂停
    if (axios.isCancel(error)) {
      console.log('上传暂停', error)
      message.warning('上传暂停')
    } else {
      // 失败重试
      if (retryCount < MAX_RETRIES) {
        console.log('上传失败了，重试中...')
        uploadFile(
          filename,
          message,
          setUploadProgress,
          resetAllStatus,
          setCancelTokens,
          retryCount + 1
        )
        return
      }
      console.error('error')
      message.error('上传错误')
    }
  }
}

/**
 * 生成切片
 * @param file 文件对象
 * @param filename 文件名
 * @returns
 */
async function createFileChunks(file: File, filename: string) {
  let chunks: FileChunkType[] = []
  let count = Math.ceil(file.size / CHUNK_SIZE)
  for (let i = 0; i < count; i++) {
    let chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    chunks.push({
      chunk,
      chunkFileName: `${filename}-${i}`,
    })
  }
  return Promise.all([
    localforage.setItem(`${INDEXDB_NAME}_${filename}`, file),
    localforage.setItem(`${INDEXDB_NAME}_${filename}_chunks`, chunks),
  ])
}

/**
 * 获取切片
 * @param filename
 * @returns
 */
async function getFileChunks(filename: string) {
  return localforage.getItem<FileChunkType[]>(
    `${INDEXDB_NAME}_${filename}_chunks`
  )
}

/**
 * 删除indexdb文件及切片
 */
function removeIndexDBFileInfo() {
  return localforage.clear()
}

/**
 * 生成预览容器
 * @param filePreview
 * @returns
 */
function renderFilePreview(filePreview: FilePreviewType) {
  const { type, url } = filePreview
  if (url) {
    if (type.startsWith('video/')) {
      return <video src={url} controls />
    } else if (type.startsWith('image/')) {
      return <img src={url} alt="preview" />
    } else {
      return url
    }
  } else {
    return <InboxOutlined></InboxOutlined>
  }
}

export default FileUploader
