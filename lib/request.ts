export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || URL.canParse(origin) && new URL(origin).host === (request.headers.get("host") || new URL(request.url).host);
}
