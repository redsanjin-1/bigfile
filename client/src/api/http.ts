import axios from 'axios'

export const axiosInstance = axios.create({
  baseURL: 'http://localhost:8080',
})

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success) {
      return response.data
    } else {
      throw new Error(response.data.message || '服务器端错误')
    }
  },
  (error) => {
    console.error('请求失败', error)
    throw error
  }
)
