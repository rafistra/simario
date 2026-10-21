/** Error thrown by every repository call, local or HTTP (docs/03_api_contract.md §2.1). */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const OFFLINE_MESSAGE = 'Anda sedang luring. Periksa jaringan Anda, lalu coba lagi.';
export const DISCONNECTED_MESSAGE =
  'Koneksi ke server terputus. Periksa jaringan Anda, lalu coba lagi.';
