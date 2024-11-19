import { useState, useEffect, RefObject, useCallback } from 'react'
import { App } from 'antd'
import { MAX_FILE_SIZE } from '../constant'

function useDrag(domRef: RefObject<HTMLDivElement>) {
  const { message } = App.useApp()

  // 选中的文件
  const [selectedFile, setSelectFile] = useState<any>(null)
  // 预览文件
  const [filePreview, setFilePreview] = useState({ type: '', url: '' })
  const handleDrag = useCallback((event: any) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])
  const checkFile = (files: any) => {
    const file = files[0]
    if (!file) {
      message.error('没有选择任何文件')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      message.error('文件大小不能超过200m')
      return
    }
    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      message.error('文件类型必须是图片或者视频')
      return
    }
    setSelectFile(file)
  }
  const handleDrop = useCallback((event: any) => {
    event.preventDefault()
    event.stopPropagation()
    checkFile(event.dataTransfer.files)
  }, [])
  const resetFileStatus = () => {
    setSelectFile(null)
    setFilePreview({ url: '', type: '' })
  }

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
  useEffect(() => {
    const container = domRef.current
    container?.addEventListener('dragenter', handleDrag)
    container?.addEventListener('dragover', handleDrag)
    container?.addEventListener('dragleave', handleDrag)
    container?.addEventListener('drop', handleDrop)

    return () => {
      container?.removeEventListener('dragenter', handleDrag)
      container?.removeEventListener('dragover', handleDrag)
      container?.removeEventListener('dragleave', handleDrag)
      container?.removeEventListener('drop', handleDrop)
    }
  }, [])

  return {
    selectedFile,
    filePreview,
    resetFileStatus,
  }
}

export default useDrag
