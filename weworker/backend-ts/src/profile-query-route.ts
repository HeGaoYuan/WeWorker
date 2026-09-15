export type BackendProfileQueryRoute = (context: any) => Promise<boolean>

let queryRoute: BackendProfileQueryRoute | null = null

export function registerBackendProfileQueryRoute(route: BackendProfileQueryRoute): void {
  if (typeof route !== 'function') throw new TypeError('Backend profile query route must be a function')
  queryRoute = route
}

export async function tryBackendProfileQueryRoute(context: any): Promise<boolean> {
  return queryRoute ? queryRoute(context) : false
}
