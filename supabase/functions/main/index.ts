import * as jose from 'jsr:@panva/jose@6'

const JWT_SECRET = Deno.env.get('JWT_SECRET')
const SUPABASE_JWKS = parseJwks(Deno.env.get('SUPABASE_JWKS'))
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'
const PUBLIC_FUNCTIONS = new Set(['stripe-connect', 'stripe-webhook'])
const FUNCTIONS_WITH_INTERNAL_AUTH = new Set([
  'stripe-start',
  'stripe-sync',
  'stripe-disconnect',
  'stripe-settings',
])

function parseJwks(raw: string | undefined): jose.JSONWebKeySet | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed?.keys && Array.isArray(parsed.keys) ? parsed as jose.JSONWebKeySet : null
  } catch {
    return null
  }
}

function getAuthToken(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) throw new Error('Missing authorization header')
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer' || !token) throw new Error("Auth header is not 'Bearer {token}'")
  return token
}

async function isValidLegacyJWT(jwt: string) {
  if (!JWT_SECRET) return false
  try {
    await jose.jwtVerify(jwt, new TextEncoder().encode(JWT_SECRET))
    return true
  } catch {
    return false
  }
}

async function isValidJWT(jwt: string) {
  if (!SUPABASE_JWKS) return false
  try {
    await jose.jwtVerify(jwt, jose.createLocalJWKSet(SUPABASE_JWKS))
    return true
  } catch {
    return false
  }
}

async function isValidHybridJWT(jwt: string) {
  const { alg } = jose.decodeProtectedHeader(jwt)
  if (alg === 'HS256') return isValidLegacyJWT(jwt)
  if (alg === 'ES256' || alg === 'RS256') return isValidJWT(jwt)
  return false
}

Deno.serve(async (req: Request) => {
  const serviceName = new URL(req.url).pathname.split('/')[1]

  const functionHandlesAuth = PUBLIC_FUNCTIONS.has(serviceName) || FUNCTIONS_WITH_INTERNAL_AUTH.has(serviceName)
  if (req.method !== 'OPTIONS' && VERIFY_JWT && !functionHandlesAuth) {
    try {
      if (!(await isValidHybridJWT(getAuthToken(req)))) {
        return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } catch (error) {
      return new Response(JSON.stringify({ msg: error instanceof Error ? error.message : String(error) }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${serviceName}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(req)
  } catch (error) {
    return new Response(JSON.stringify({ msg: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
