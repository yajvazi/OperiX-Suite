import { supabase } from '@invoice-monorepo/api';
import { createDeskApi } from '@invoice-monorepo/desk-api';

export const deskApiBaseUrl =
  process.env.EXPO_PUBLIC_DESK_API_URL || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8002/api';

export const deskApi = createDeskApi({
  baseUrl: deskApiBaseUrl,
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  },
});

export async function getDeskImageSource(imageUrl: string) {
  const { data } = await supabase.auth.getSession();
  const normalized = imageUrl.startsWith('http')
    ? imageUrl
    : `${deskApiBaseUrl.replace(/\/api\/?$/, '')}${imageUrl}`;
  return {
    uri: normalized,
    headers: data.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : undefined,
  };
}
