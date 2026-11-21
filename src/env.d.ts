// Public build settings read from the environment (astro.config.ts copies them
// from .env locally or from the GitHub repository variables in CI).
interface ImportMetaEnv {
  /** OAuth client id of the Google Cloud project (public by design; never a secret). */
  readonly PUBLIC_GOOGLE_CLIENT_ID?: string;
  /** Dropbox app key (public by design; PKCE needs no app secret). */
  readonly PUBLIC_DROPBOX_APP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
