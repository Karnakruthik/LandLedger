export const tokenKey = "landledger.session";
export async function api(path, { method = "GET", body, binary = false } = {}) {
  const token = sessionStorage.getItem(tokenKey);
  const headers = token ? { Authorization: "Bearer " + token } : {};
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch("/api" + path, { method, body, headers });
  } catch {
    throw Error("The registry service is unavailable. Please try again.");
  }
  if (!res.ok) {
    if (res.status === 401 && token) {
      sessionStorage.removeItem(tokenKey);
      window.dispatchEvent(new Event("session-ended"));
    }
    const error = await res.json().catch(() => ({}));
    throw Error(
      error.message ||
        (res.status >= 500
          ? "The registry service is unavailable. Please try again."
          : "The request could not be completed."),
    );
  }
  return binary ? res.blob() : res.json();
}
export const compact = (v) => (v ? v.slice(0, 7) + "…" + v.slice(-5) : "—");
export const date = (v) =>
  v
    ? new Date(Number(v)).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export async function download(path, name) {
  const blob = await api(path, { binary: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
