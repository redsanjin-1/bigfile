import { useState, useEffect, RefObject } from 'react'
import { App } from 'antd'
import { MAX_FILE_SIZE, ALLOW_MEDIA_TYPE, UPLOAD_STATUS } from '../constant'

export type FilePreviewType = {
  type: string
  url: string
}

/**
 * 点击，拖拽上传文件
 * @param domRef 上传区域 ref
 * @param uploadStatus 上传状态
 * @returns
 */
function useDrag(
  domRef: RefObject<HTMLDivElement>,
  uploadStatus: UPLOAD_STATUS
) {
  const { message } = App.useApp()

  // 选中的文件
  const [selectedFile, setSelectFile] = useState<File | null>(null)
  // 预览文件
  const [filePreview, setFilePreview] = useState<FilePreviewType>({
    type: '',
    url: '',
  })
  const handleDrag = (event: DragEvent) => {
    event.preventDefault()
  }
  const checkFile = (files: FileList) => {
    const file = files[0]
    if (!file) {
      message.error('没有选择任何文件')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      message.error('文件大小不能超过200m')
      return
    }
    // if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
    //   message.error('文件类型必须是图片或者视频')
    //   return
    // }
    if (!ALLOW_MEDIA_TYPE.includes(file.type)) {
      message.error('文件类型限制jpg,png,webp,gif,mp4,avi,wav')
      return
    }
    setSelectFile(file)
  }
  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    if (!event.dataTransfer) return
    if (uploadStatus !== UPLOAD_STATUS.NOT_STARTED) return
    checkFile(event.dataTransfer.files)
  }
  const handleClick = () => {
    if (uploadStatus !== UPLOAD_STATUS.NOT_STARTED) return
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.style.display = 'none'
    fileInput.addEventListener('change', (event: Event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        message.error('事件目标不是文件输入元素')
        return
      }
      if (!event.target.files) return
      checkFile(event.target.files)
    })
    document.body.appendChild(fileInput)
    fileInput.click()
  }
  const resetFileStatus = () => {
    setSelectFile(null)
    setFilePreview({ url: '', type: '' })
  }

  // 点击上传
  useEffect(() => {
    const uploadContainer = domRef.current
    if (!uploadContainer) return
    uploadContainer.addEventListener('click', handleClick)

    return () => {
      uploadContainer.removeEventListener('click', handleClick)
    }
  }, [uploadStatus])
  // 生成预览url
  useEffect(() => {
    if (!selectedFile) return
    const url = URL.createObjectURL(selectedFile)
    setFilePreview({
      url,
      type: selectedFile.type,
    })

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [selectedFile])
  // 绑定拖拽事件
  useEffect(() => {
    const container = domRef.current
    container?.addEventListener('dragover', handleDrag)
    container?.addEventListener('drop', handleDrop)

    return () => {
      container?.removeEventListener('dragover', handleDrag)
      container?.removeEventListener('drop', handleDrop)
    }
  }, [])

  return {
    selectedFile,
    filePreview,
    resetFileStatus,
    setSelectFile,
  }
}

export default useDrag
