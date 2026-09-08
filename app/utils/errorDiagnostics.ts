export type IosNetworkIssueKind =
  | 'connection_refused'
  | 'timeout'
  | 'ssl_or_certificate'
  | 'ats_blocked'
  | 'dns_or_host'
  | 'unknown';

export type ErrorDiagnostics = {
  name: string | null;
  message: string;
  code: string | number | null;
  status: number | null;
  statusCode: number | null;
  statusText: string | null;
  data: unknown;
  request: string | null;
  method: string | null;
  isNetworkError: boolean;
  platform: string | null;
  iosNetworkIssue: IosNetworkIssueKind | null;
  iosHint: string | null;
  toJSON: unknown;
};

type CreateErrorDiagnosticsOptions = {
  request?: unknown;
  method?: unknown;
  status?: unknown;
  statusText?: unknown;
  data?: unknown;
  platform?: unknown;
};

const DIAGNOSTIC_KEY = '__mentalaErrorDiagnostics';
type UnknownRecord = Record<string, unknown>;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object') return null;
  return value as UnknownRecord;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractRequestUrl(request: unknown): string | null {
  if (!request) return null;
  if (typeof request === 'string') return request;
  if (typeof Request !== 'undefined' && request instanceof Request) {
    return request.url || null;
  }

  const obj = asRecord(request);
  if (obj && typeof obj.url === 'string') {
    return obj.url;
  }

  try {
    return String(request);
  } catch {
    return null;
  }
}

function extractCode(
  errorRecord: UnknownRecord | null
): string | number | null {
  if (!errorRecord) return null;

  const direct = errorRecord.code;
  if (typeof direct === 'string' || typeof direct === 'number') {
    return direct;
  }

  const causeCode = asRecord(errorRecord.cause)?.code;
  if (typeof causeCode === 'string' || typeof causeCode === 'number') {
    return causeCode;
  }

  const message = safeStringify(errorRecord.message || '');
  const codeMatch = message.match(/code\s*=\s*(-?\d+)/i);
  if (codeMatch) {
    const numericCode = toFiniteNumber(codeMatch[1]);
    return numericCode ?? codeMatch[1];
  }

  return null;
}

function classifyIosNetworkIssue(
  message: string,
  code: string | number | null
): IosNetworkIssueKind {
  const signature = `${String(code ?? '')} ${message}`.toLowerCase();

  if (
    signature.includes('-1022') ||
    signature.includes('app transport security') ||
    signature.includes('requires secure connection') ||
    signature.includes('cleartext')
  ) {
    return 'ats_blocked';
  }

  if (
    signature.includes('-1001') ||
    signature.includes('timeout') ||
    signature.includes('timed out') ||
    signature.includes('aborterror')
  ) {
    return 'timeout';
  }

  if (
    signature.includes('-1003') ||
    signature.includes('could not find host') ||
    signature.includes('name or service not known') ||
    signature.includes('dns')
  ) {
    return 'dns_or_host';
  }

  if (
    signature.includes('-1004') ||
    signature.includes('econnrefused') ||
    signature.includes('connection refused') ||
    signature.includes('failed to connect') ||
    signature.includes('could not connect')
  ) {
    return 'connection_refused';
  }

  if (
    signature.includes('-1200') ||
    signature.includes('-1202') ||
    signature.includes('ssl') ||
    signature.includes('tls') ||
    signature.includes('certificate') ||
    signature.includes('secure connection')
  ) {
    return 'ssl_or_certificate';
  }

  return 'unknown';
}

function getIosHint(issue: IosNetworkIssueKind | null): string | null {
  if (!issue) return null;
  if (issue === 'connection_refused') {
    return 'Сервер недоступен (connection refused). Проверь, что reverse-proxy/API подняты и слушают нужный порт.';
  }
  if (issue === 'timeout') {
    return 'Сетевой timeout. Проверь доступность домена/маршрут и задержку сети.';
  }
  if (issue === 'ssl_or_certificate') {
    return 'Проблема TLS/сертификата. На iOS Simulator проверь доверие к локальному сертификату.';
  }
  if (issue === 'ats_blocked') {
    return 'Запрос вероятно заблокирован ATS. Проверь Info.plist (NSAppTransportSecurity) и протокол/шифры.';
  }
  if (issue === 'dns_or_host') {
    return 'Не удалось резолвить хост. Проверь DNS/hosts и доступность домена из симулятора.';
  }
  return 'Неопределённая network-level ошибка iOS (часто TLS/ATS/DNS или недоступный хост). Проверь сертификат, ATS и доступность домена из iOS Simulator.';
}

function isDiagnosticsShape(value: unknown): value is ErrorDiagnostics {
  const obj = asRecord(value);
  return !!obj && typeof obj.message === 'string' && 'isNetworkError' in obj;
}

export function createErrorDiagnostics(
  error: unknown,
  options: CreateErrorDiagnosticsOptions = {}
): ErrorDiagnostics {
  const errorRecord = asRecord(error);
  const responseRecord = asRecord(errorRecord?.response);

  const message = safeStringify(
    errorRecord?.message ?? errorRecord?.cause?.message ?? error
  ).trim();
  const statusFromOptions = toFiniteNumber(options.status);
  const statusFromError =
    toFiniteNumber(errorRecord?.status) ??
    toFiniteNumber(errorRecord?.statusCode) ??
    toFiniteNumber(responseRecord?.status);
  const status = statusFromOptions ?? statusFromError;

  const statusText =
    (typeof options.statusText === 'string' && options.statusText) ||
    (typeof errorRecord?.statusText === 'string' && errorRecord.statusText) ||
    (typeof responseRecord?.statusText === 'string' &&
      responseRecord.statusText) ||
    null;

  const data =
    options.data ??
    errorRecord?.data ??
    responseRecord?._data ??
    responseRecord?.data ??
    null;

  const code = extractCode(errorRecord);
  const platform =
    typeof options.platform === 'string' && options.platform
      ? options.platform
      : null;
  const isNetworkError = status === null;
  const iosNetworkIssue =
    platform === 'ios' && isNetworkError
      ? classifyIosNetworkIssue(message, code)
      : null;

  let toJSONData: unknown = null;
  if (typeof errorRecord?.toJSON === 'function') {
    try {
      toJSONData = errorRecord.toJSON();
    } catch {
      toJSONData = { failed: true };
    }
  }

  return {
    name: typeof errorRecord?.name === 'string' ? errorRecord.name : null,
    message: message || 'Unknown error',
    code,
    status,
    statusCode: status,
    statusText,
    data,
    request: extractRequestUrl(options.request ?? errorRecord?.request),
    method:
      typeof options.method === 'string' ? options.method.toUpperCase() : null,
    isNetworkError,
    platform,
    iosNetworkIssue,
    iosHint: getIosHint(iosNetworkIssue),
    toJSON: toJSONData,
  };
}

export function attachErrorDiagnostics(
  error: unknown,
  diagnostics: ErrorDiagnostics
): void {
  const record = asRecord(error);
  if (!record) return;

  try {
    record[DIAGNOSTIC_KEY] = diagnostics;
  } catch {
    // Игнорируем: некоторые объекты ошибок могут быть readonly.
  }
}

export function getErrorDiagnostics(error: unknown): ErrorDiagnostics {
  const record = asRecord(error);
  const cached = record?.[DIAGNOSTIC_KEY];
  if (isDiagnosticsShape(cached)) {
    return cached;
  }
  return createErrorDiagnostics(error);
}

/**
 * Приводит произвольный payload к JSON-строке для iOS WebView логов.
 * В Xcode объекты из console.error часто отображаются как `{}`,
 * поэтому логируем строку вместо второго объектного аргумента.
 */
export function stringifyForLog(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return safeStringify(value);
  }
}

/**
 * Возвращает строковый JSON с диагностикой ошибки для стабильного вывода в iOS.
 */
export function getErrorDiagnosticsLog(error: unknown): string {
  return stringifyForLog(getErrorDiagnostics(error));
}
