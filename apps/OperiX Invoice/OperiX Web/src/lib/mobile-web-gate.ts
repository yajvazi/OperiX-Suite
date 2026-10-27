export const PHONE_WEB_BREAKPOINT = 767;

export interface PhoneWebSignals {
  width: number;
  height: number;
  coarsePointer?: boolean;
  maxTouchPoints?: number;
  userAgent?: string;
}

const phoneUserAgent = /(iphone|ipod|android.*mobile|windows phone|blackberry|mobile safari)/i;
const tabletUserAgent = /(ipad|tablet|android(?!.*mobile))/i;

function isTouchMac(userAgent: string, maxTouchPoints: number) {
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** Viewport size is primary; touch and UA data refine phone/tablet detection. */
export function isPhoneSizedWebDevice({ width, height, coarsePointer = false, maxTouchPoints = 0, userAgent = "" }: PhoneWebSignals) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;

  const isPhoneUA = phoneUserAgent.test(userAgent);
  const isTabletUA = tabletUserAgent.test(userAgent) || isTouchMac(userAgent, maxTouchPoints);
  if (isTabletUA && !isPhoneUA) return false;

  const shortSide = Math.min(width, height);
  const isPhoneViewport = width <= PHONE_WEB_BREAKPOINT;
  const isPhoneLandscape = isPhoneUA && shortSide <= PHONE_WEB_BREAKPOINT;
  const isSmallTouchViewport = (coarsePointer || maxTouchPoints > 0) && shortSide <= PHONE_WEB_BREAKPOINT;
  return isPhoneViewport || isPhoneLandscape || isSmallTouchViewport;
}

const MOBILE_WEB_ROUTE_ALLOWLIST = [
  /^\/(?:login|signup)(?:\/|$)/,
  /^\/auth(?:\/|$)/,
  /^\/offline(?:\/|$)/,
  /^\/api(?:\/|$)/,
  /^\/(?:pos\/complete|demo|portal|qr|open)(?:\/|$)/,
  /^\/\.well-known(?:\/|$)/,
  /^\/(?:privacy|terms|support|legal)(?:\/|$)/,
  /^\/(?:subscription\/confirmation|billing\/(?:success|cancel)|stripe)(?:\/|$)/,
];

export function isMobileWebRouteAllowed(pathname: string) {
  const normalized = `/${pathname.replace(/^\/+/, "")}`;
  return MOBILE_WEB_ROUTE_ALLOWLIST.some((pattern) => pattern.test(normalized));
}

export { MOBILE_WEB_ROUTE_ALLOWLIST };
