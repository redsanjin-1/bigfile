# 大文件上传
- [x] 拖拽，点击上传
- [x] 分片上传
- [x] 秒传
- [x] 断点续传
- [x] 失败重传
- [x] `IndexedDB`缓存文件
- [x] 上传进度条
- [x] `web worker`优化性能 
- [ ] 控制并发上传

## 前端项目
使用`vite` + `react18` + `typescript` + `antd`构建  

开发调试命令
```shell
pnpm run dev
```

### 拖拽上传
通过监听容器的`dragover`事件，阻止默认行为([why](https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLElement/drop_event))，然后监听`drop`事件，获取文件信息
```typescript
const handleDrag = (event: DragEvent) => {
  event.preventDefault()
}
const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  // ...
}
useEffect(() => {
  const container = domRef.current
  container?.addEventListener('dragover', handleDrag)
  container?.addEventListener('drop', handleDrop)

  return () => {
    container?.removeEventListener('dragover', handleDrag)
    container?.removeEventListener('drop', handleDrop)
  }
}, [])
```

### 点击上传
通过监听容器的`click`事件，动态生成`file`类型的`input`元素，插入`document`中再模拟点击事件
```typescript
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
// 点击上传
useEffect(() => {
  const uploadContainer = domRef.current
  if (!uploadContainer) return
  uploadContainer.addEventListener('click', handleClick)

  return () => {
    uploadContainer.removeEventListener('click', handleClick)
  }
}, [uploadStatus])
```

### 预览本地上传的文件
通过`URL.createObjectURL()`, 生成本地预览`url`
```typescript
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
```

### 分片上传
因为[`file`](https://developer.mozilla.org/zh-CN/docs/Web/API/File)文件原型继承了[`Blob`](https://developer.mozilla.org/zh-CN/docs/Web/API/Blob), 可以使用`Blob.slice()`进行切分

### 秒传
根据`file`对象, 通过[`crypto`](https://developer.mozilla.org/zh-CN/docs/Web/API/Crypto)计算`hash`文件名,然后通过`axios`请求后端接口, 判断文件是否已存在
```typescript
/**
 * 根据文件对象获取文件内容的 hash 文件名
 * @param file 文件
 */
export async function getFileName(file: File) {
  const fileHash = await calculateFileHash(file)
  const fileExtension = file.name.split('.').pop()

  return `${fileHash}.${fileExtension}`
}

/**
 * 计算文件 hash 字符串
 * @param file 文件
 * @returns
 */
export async function calculateFileHash(file: File) {
  const fileArrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileArrayBuffer)
  return bufferToHex(hashBuffer)
}

/**
 * 将 arraybuffer 转为 16 进制的字符串
 * @param buffer
 * @returns
 */
export function bufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
```

### 断点续传

本次使用[`axios`](https://www.axios-http.cn/docs/intro)作为请求库，默认使用[`XHR`](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)方式发送请求，可以使用[`canceltoken`](https://www.axios-http.cn/docs/cancellation#canceltoken)；如果使用`fetch`方式，也可以使用`AbortController`来实现取消请求。

断点续传的核心思想是，通过`axios`发送请求时，设置`Range`请求头，指定请求的范围，然后后端根据`Range`请求头返回对应的数据，前端再根据返回的数据进行拼接。

### `IndexedDB`缓存文件
使用[localForage](https://github.com/localForage/localForage)缓存文件，当用户上传文件时，将文件切片后，将文件及切片信息存储到`IndexedDB`中，当用户刷新页面或者下次打开页面时，从`IndexedDB`中获取切片信息，然后继续上传文件。

### 上传进度条
通过`axios`的`onUploadProgress`事件，获取上传进度，搭配`antd`的组件`Progress`实现

```typescript
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
```

### `web worker`优化性能
[Web Worker](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API) 使得在一个独立于 Web 应用程序主执行线程的后台线程中运行脚本操作成为可能。这样做的好处是可以在独立线程中执行费时的处理任务，使主线程（通常是 UI 线程）的运行不会被阻塞/放慢。
> 核心逻辑
* 在`public`目录新建`filenameWorker.js`文件，用于计算文件`hash`，首先监听`message`得到`file`, 计算`hash`后使用`postMessage`发送消息到主线程
* 在主线程引入`filenameWorker.js`, 用户上传文件后`postMessage`到`worker`线程，在 监听`message`事件得到文件名

### 控制并发上传

## 后端项目
使用`express` + `typescript`构建

开发调试请运行一下命令
```shell
pnpm run dev
```