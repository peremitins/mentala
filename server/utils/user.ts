import { getCookie, setCookie } from 'h3'

export function getOrSetAnonUserId(event: any): string {
  let uid = getCookie(event, 'anon_uid')
  if (!uid) {
    uid = crypto.randomUUID()
    // 365 days
    setCookie(event, 'anon_uid', uid, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return uid
}
