declare module 'sm-crypto' {
  export const sm4: {
    encrypt(data: string, key: string, options?: Record<string, unknown>): string
    decrypt(data: string, key: string, options?: Record<string, unknown>): string
  }
}
