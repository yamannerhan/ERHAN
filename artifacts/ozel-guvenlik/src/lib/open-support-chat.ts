/** Canlı destek paneline yönlendir — ileride bottom-sheet veya widget'a bağlanabilir. */
export function openSupportChat(navigate?: (path: string) => void): void {
  const win = window as Window & { __ogOpenSupport?: () => void };
  if (typeof win.__ogOpenSupport === "function") {
    win.__ogOpenSupport();
    return;
  }
  if (navigate) {
    navigate("/destek");
    return;
  }
  window.location.assign("/destek");
}
