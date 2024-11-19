import { useRef } from 'react'
import { InboxOutlined } from '@ant-design/icons'
import { Button, App, theme } from 'antd'
import { MessageInstance } from 'antd/es/message/interface'
import './FileUploader.css'
import useDrag from './hooks/useDrag'
import { CHUNK_SIZE } from './constant'
import axiosInstance from './api/http'

const { useToken } = theme

function FileUploader() {
  const { message } = App.useApp()
  const uploadContainerRef = useRef<HTMLDivElement>(null)
  const { filePreview, selectedFile } = useDrag(uploadContainerRef)
  const { token } = useToken()
  const containerStyle = {
    backgroundColor: token.colorFillAlter,
    borderColor: token.colorBorder,
  }

  const renderButton = () => {
    return (
      <Button type="primary" onClick={handleUpload}>
        上传
      </Button>
    )
  }
  const handleUpload = async () => {
    if (!selectedFile) {
      message.error('未选择文件')
    }
    const filename = await getFileName(selectedFile)
    console.log(filename)
    await uploadFile(selectedFile, filename, message)
  }

  return (
    <>
      <div
        className="upload-container"
        ref={uploadContainerRef}
        style={containerStyle}
      >
        {renderFilePreview(filePreview)}
      </div>
      {renderButton()}
    </>
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
  message: MessageInstance
) {
  const chunks = createFileChunks(file, filename)
  console.log(chunks)
  const requests = chunks.map(({ chunk, chunkFileName }) => {
    return createRequest(filename, chunkFileName, chunk)
  })
  try {
    // 并行上传每个分片
    await Promise.all(requests)
    // 合并分片
    await axiosInstance.get(`/merge/${filename}`)
    message.success('上传成功')
  } catch (error) {
    console.error('error')
    console.log('message', message)
    message.error('上传错误')
  }
}

function createRequest(filename: string, chunkFileName: string, chunk: Blob) {
  return axiosInstance.post(`/upload/${filename}`, chunk, {
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    params: {
      chunkFileName,
    },
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
