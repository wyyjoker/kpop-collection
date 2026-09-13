export async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = (response.headers.get("content-type") || "").includes(
    "application/json",
  )
    ? await response.json()
    : null;
  if (!response.ok)
    throw new Error(payload?.error || `请求失败（${response.status}）`);
  return payload;
}
export const save = (url, payload, method = "PUT") =>
  request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export async function upload(file) {
  if (!file?.size) return "";
  const body = new FormData();
  body.append("image", file);
  return (await request("/api/upload", { method: "POST", body })).path;
}
