export interface YooKassaWidgetOptions {
  confirmation_token: string;
  return_url?: string;
  customization?: {
    modal?: boolean;
    colors?: Record<string, string>;
  };
  error_callback?: (error: unknown) => void;
}

export interface YooKassaWidgetInstance {
  render: (target?: string | HTMLElement) => void | Promise<void>;
  destroy?: () => void | Promise<void>;
  on?: (event: string, callback: () => void) => void;
}

export interface YooKassaWidgetConstructor {
  new (options: YooKassaWidgetOptions): YooKassaWidgetInstance;
}

declare global {
  interface Window {
    YooMoneyCheckoutWidget?: YooKassaWidgetConstructor;
  }
}

export {};
