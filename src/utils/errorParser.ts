import type { ValidationError422 } from '../types/config'
import { isAxiosError } from 'axios'

export function parse422Errors(error: unknown): string[] {
  if (!isAxiosError(error)) return ['网络异常，请稍后重试']

  if (error.response?.status === 422) {
    const data = error.response.data as ValidationError422
    if (data?.detail && Array.isArray(data.detail)) {
      return data.detail.map((item) => {
        const field = item.loc.filter((v) => typeof v === 'string').join('.')
        return field ? `${field}: ${item.msg}` : item.msg
      })
    }
    return ['请求参数验证失败']
  }

  if (error.response?.data?.msg) {
    return [error.response.data.msg]
  }

  return ['网络异常，请稍后重试']
}
