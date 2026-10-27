module.exports = ({ config }) => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || ''
  ).trim();

  if (
    process.env.NODE_ENV === 'production'
    && (!url || !key || url.includes('placeholder') || key.includes('placeholder') || key === 'sb_publishable_...')
  ) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the Invoice production build.');
  }

  const linkDomain = (process.env.EXPO_PUBLIC_OPERIX_INVOICE_LINK_DOMAIN || 'invoice.operixsuite.com')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const associatedDomain = `applinks:${linkDomain}`;
  const ios = config.ios || {};
  const android = config.android || {};
  const associatedDomains = Array.from(new Set([...(ios.associatedDomains || []), associatedDomain]));
  const intentFilters = [
    ...(android.intentFilters || []),
    {
      action: 'VIEW',
      autoVerify: true,
      data: [{ scheme: 'https', host: linkDomain, pathPrefix: '/open' }],
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ];

  return {
    ...config,
    ios: { ...ios, associatedDomains },
    android: { ...android, intentFilters },
  };
};
