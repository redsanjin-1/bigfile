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

/**
 * 请求队列
 */
export class RequestQueue {
  concurrency: number // 并发数
  queue: any[]
  running: number

  constructor(concurrency = 5) {
    this.concurrency = concurrency
    this.queue = []
    this.running = 0
  }

  add(request: () => Promise<any>) {
    this.queue.push({ request })
    this.process()
  }

  process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return
    }

    this.running++

    const { request } = this.queue.shift()
    request().finally(() => {
      this.running--
      this.process()
    })
  }
}
