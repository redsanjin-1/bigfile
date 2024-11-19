import { useRef, useState } from 'react'
import { InboxOutlined } from '@ant-design/icons'
import { Button, App, theme, Progress, Space } from 'antd'
import { MessageInstance } from 'antd/es/message/interface'
// import { AxiosProgressEvent } from 'axios'
import './FileUploader.css'
import useDrag from './hooks/useDrag'
import { CHUNK_SIZE, UPLOAD_STATUS } from './constant'
import axiosInstance from './api/http'
import axios, { CancelTokenSource } from 'axios'

const { useToken } = theme

function FileUploader() {
  const { message } = App.useApp()
  const uploadContainerRef = useRef<HTMLDivElement>(null)
  const { filePreview, selectedFile, resetFileStatus } =
    useDrag(uploadContainerRef)
  const { token } = useToken()
  const containerStyle = {
    backgroundColor: token.colorFillAlter,
    borderColor: token.colorBorder,
  }
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {}
  )
  const [uploadStatus, setUploadStatus] = useState(UPLOAD_STATUS.NOT_STARTED)
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
    const filename = await getFileName(selectedFile)
    console.log('filename', filename)
    await uploadFile(
      selectedFile,
      filename,
      message,
      setUploadProgress,
      resetAllStatus,
      setCancelTokens
    )
  }
  const resetAllStatus = () => {
    resetFileStatus()
    setUploadProgress({})
    setUploadStatus(UPLOAD_STATUS.NOT_STARTED)
  }

  return (
    <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
      <div
        className="upload-container"
        ref={uploadContainerRef}
        style={containerStyle}
      >
        {renderFilePreview(filePreview)}
      </div>
      {renderButton()}
      {renderProgress()}
    </Space>
  )
}

/**
 * 实现切片上传
 * @param file 文件
 * @param filename 文件名
 */
async function uploadFile(
  file: File,
  filename: string,
  message: MessageInstance,
  setUploadProgress: Function,
  resetAllStatus: Function,
  setCancelTokens: Function
) {
  const verifyRes: any = await axiosInstance.get(`/verify/${filename}`)
  if (!verifyRes.needUpload) {
    message.success('文件已存在，秒传成功')
    return resetAllStatus()
  }
  // 生成切片
  const chunks = createFileChunks(file, filename)
  const newCancelTokens: CancelTokenSource[] = []
  const requests = chunks.map(({ chunk, chunkFileName }) => {
    const cancelToken = axios.CancelToken.source()
    newCancelTokens.push(cancelToken)
    const existingChunk = verifyRes.uploadedChunkList.find(
      (uploadedChunk: any) => {
        return uploadedChunk.chunkFileName === chunkFileName
      }
    )
    // 此分片已经上传了一部分，或者已经完全上传
    if (existingChunk) {
      const uploadedSize = existingChunk.size
      const remainingChunk = chunk.slice(uploadedSize)
      // 已经完全上传
      if (remainingChunk.size === 0) {
        setUploadProgress((preProgress: any) => ({
          ...preProgress,
          [chunkFileName]: 100,
        }))
        return Promise.resolve()
      }
      setUploadProgress((preProgress: any) => ({
        ...preProgress,
        [chunkFileName]: (uploadedSize * 100) / chunk.size,
      }))

      return createRequest(
        filename,
        chunkFileName,
        remainingChunk,
        setUploadProgress,
        cancelToken,
        uploadedSize,
        chunk.size
      )
    } else {
      return createRequest(
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
    await axiosInstance.get(`/merge/${filename}`)
    await message.success('上传成功')
    resetAllStatus()
  } catch (error) {
    // 用户主动点击暂停
    if (axios.isCancel(error)) {
      console.log('上传暂停', error)
      message.warning('上传暂停')
    } else {
      console.error('error')
      message.error('上传错误')
    }
  }
}

function createRequest(
  filename: string,
  chunkFileName: string,
  chunk: Blob,
  setUploadProgress: Function,
  cancelToken: CancelTokenSource,
  start: number,
  totalSize: number
) {
  return axiosInstance.post(`/upload/${filename}`, chunk, {
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    params: {
      chunkFileName,
      start, // 写入文件的起始位置
    },
    // AxiosProgressEvent
    onUploadProgress: (event: any) => {
      // 用已上传的字节数 + 上次上传成功字节数 / 总字节数
      const percentCompleted = Math.round(
        ((event.loaded + start) * 100) / totalSize
      )
      setUploadProgress((preProgress: any) => ({
        ...preProgress,
        [chunkFileName]: percentCompleted,
      }))
    },
    cancelToken: cancelToken.token,
  })
}

function createFileChunks(file: File, filename: string) {
  let chunks = []
  let count = Math.ceil(file.size / CHUNK_SIZE)
  for (let i = 0; i < count; i++) {
    let chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    chunks.push({
      chunk,
      chunkFileName: `${filename}-${i}`,
    })
  }

  return chunks
}

/**
 * 根据文件对象获取文件内容的 hash 文件名
 * @param file 文件
 */
async function getFileName(file: File) {
  const fileHash = await calculateFileHash(file)
  const fileExtension = file.name.split('.').pop()

  return `${fileHash}.${fileExtension}`
}

/**
 * 计算文件 hash 字符串
 * @param file 文件
 * @returns
 */
async function calculateFileHash(file: File) {
  const fileArrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileArrayBuffer)
  return bufferToHex(hashBuffer)
}

/**
 * 将 arraybuffer 转为 16 进制的字符串
 * @param buffer
 * @returns
 */
function bufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function renderFilePreview(filePreview: any) {
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
