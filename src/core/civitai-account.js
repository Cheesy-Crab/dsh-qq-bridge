const BALANCE_URL = 'https://civitai.com/api/trpc/buzz.getBuzzAccount'

/**
 * Read the Civitai account Buzz balance. The token is resolved from DSH
 * credentials, never logged, and only the sums are returned.
 * @param {{ resolve: (ref: string) => Promise<{ value?: string } | undefined> }} credentials
 * @param {{ fetch?: typeof fetch }} [options]
 * @returns {Promise<{ blue: number, green: number, yellow: number, total: number }>}
 */
export async function fetchCivitaiBalance(credentials, { fetch = globalThis.fetch } = {}) {
  if (!credentials?.resolve) throw new Error('DSH credentials 服务不可用')
  const hit = await credentials.resolve('CIVITAI_API_TOKEN')
  const token = hit?.value?.trim()
  if (!token) throw new Error('未配置 Civitai API Token，请先在 image-gen 设置中配置')
  const response = await fetch(BALANCE_URL, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (response.status === 403) throw new Error('Civitai API Token 缺少 BuzzRead 权限')
  if (!response.ok) throw new Error(`Civitai 余额查询失败：HTTP ${response.status}`)
  const payload = await response.json()
  const account = payload?.result?.data?.json ?? payload
  const blue = Number(account?.blue ?? 0)
  const green = Number(account?.green ?? 0)
  const yellow = Number(account?.yellow ?? 0)
  if (![blue, green, yellow].every(Number.isFinite)) throw new Error('Civitai 余额响应格式异常')
  return { blue, green, yellow, total: blue + green + yellow }
}
