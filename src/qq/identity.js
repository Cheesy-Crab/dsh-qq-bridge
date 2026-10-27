export function qqPrincipal(id) {
  return `qq:${String(id ?? '').trim()}`
}

export function qqGroupPrincipal(id) {
  return `qq-group:${String(id ?? '').trim()}`
}
