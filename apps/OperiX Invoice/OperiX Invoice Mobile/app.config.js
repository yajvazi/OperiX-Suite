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

  return config;
};
