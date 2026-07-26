export function isAdminAuthorization(header: string | null, password: string | undefined): boolean {
  if (!password || !header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const supplied = decoded.slice(separator + 1);
    if (supplied.length !== password.length) return false;
    let mismatch = 0;
    for (let index = 0; index < supplied.length; index += 1) {
      mismatch |= supplied.charCodeAt(index) ^ password.charCodeAt(index);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}
