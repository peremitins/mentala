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

async function fetchLandingConfig(
  baseURL: string,
  appAuthUrl: string
): Promise<LandingConfig> {
  try {
    const response = await $fetch<LandingConfig>('/api/landing/config', {
      baseURL,
      retry: 0,
      timeout: 2500,
    });

    return {
      isReleased: Boolean(response.isReleased),
      ctaUrl: response.ctaUrl || appAuthUrl,
      updatedAt: response.updatedAt || new Date().toISOString(),
    };
  } catch (error) {
    const message = getSafeErrorMessage(error);
    if (import.meta.dev) {
      console.warn(
        `[Landing] Release config unavailable (${message}). Using fallback config.`
      );
    }
    return {
      ...DEFAULT_CONFIG,
      ctaUrl: appAuthUrl,
    };
  }
}

export function useLandingConfig() {
  const runtimeConfig = useRuntimeConfig();
  const baseURL = runtimeConfig.public.landingApiBase;
  const appAuthUrl = runtimeConfig.public.appAuthUrl;

  const defaultConfig: LandingConfig = {
    ...DEFAULT_CONFIG,
    ctaUrl: appAuthUrl,
  };

  const result = useAsyncData<LandingConfig>(
    'landing-config',
    () => fetchLandingConfig(baseURL, appAuthUrl),
    {
      server: true,
      lazy: false,
      default: () => defaultConfig,
    }
  );

  // При статическом экспорте useAsyncData может не выполнять запрос на клиенте
  // (данные берутся из payload). Явный $fetch в onMounted гарантирует, что
  // конфиг всегда запрашивается при загрузке страницы.
  onMounted(async () => {
    const config = await fetchLandingConfig(baseURL, appAuthUrl);
    result.data.value = config;
  });

  return result;
}
