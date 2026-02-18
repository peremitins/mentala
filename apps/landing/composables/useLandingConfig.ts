export type LandingConfig = {
  isReleased: boolean;
  ctaUrl: string;
  updatedAt: string;
};

const DEFAULT_CONFIG: LandingConfig = {
  isReleased: false,
  ctaUrl: 'https://my.mentala.app/auth',
  updatedAt: new Date(0).toISOString(),
};

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'unknown error';
}

export function useLandingConfig() {
  const runtimeConfig = useRuntimeConfig();

  return useAsyncData<LandingConfig>(
    'landing-config',
    async () => {
      try {
        const response = await $fetch<LandingConfig>('/api/landing/config', {
          baseURL: runtimeConfig.public.landingApiBase,
          retry: 0,
          timeout: 2500,
        });

        return {
          isReleased: Boolean(response.isReleased),
          ctaUrl: response.ctaUrl || runtimeConfig.public.appAuthUrl,
          updatedAt: response.updatedAt || new Date().toISOString(),
        };
      } catch (error) {
        // Логируем только строку, чтобы Nuxt dev-логгер не падал на non-POJO ошибках.
        const message = getSafeErrorMessage(error);
        if (import.meta.dev) {
          console.warn(
            `[Landing] Release config unavailable (${message}). Using fallback config.`
          );
        }
        return {
          ...DEFAULT_CONFIG,
          ctaUrl: runtimeConfig.public.appAuthUrl,
        };
      }
    },
    {
      server: true,
      lazy: false,
      default: () => ({
        ...DEFAULT_CONFIG,
        ctaUrl: runtimeConfig.public.appAuthUrl,
      }),
    }
  );
}
