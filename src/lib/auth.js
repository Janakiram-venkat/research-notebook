// Local-only stand-in for the app's auth layer.
//
// The notebook store, assets, versions, sharing and retention all ask
// `getUser()?.id` before they touch a remote, so a user that is always null
// keeps every one of them on the local path (localStorage + embedded images).
// When a backend is wired in later, this is the one file to replace.

export function getUser() { return null }
export async function getSupabase() {
  throw new Error('No backend is connected. The notebook is running local-only.')
}
export async function checkSession() { return null }
export function onAuthChange() { return { unsubscribe() {} } }
export async function authHeaders() { return {} }
