interface Env {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

/**
 * Public page settings. The page asks this endpoint whether bot protection is on, so the page and the
 * report server can never disagree (a half-configured Turnstile used to block every lead).
 * Bot protection is only reported as on when BOTH the site key and the secret key are set.
 */
export const onRequestGet = async ({ env }: { env: Env }): Promise<Response> => {
  const on = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
  return new Response(JSON.stringify({ turnstileSiteKey: on ? env.TURNSTILE_SITE_KEY : '' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' }
  });
};
