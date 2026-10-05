/**
 * Per-request API client context for the hosted (HTTP) transport.
 *
 * Tools call getApiClient() at execution time. In stdio mode that returns the
 * process-wide client built from env vars; in HTTP mode every request runs
 * inside runWithApiClient(), so tools transparently use the caller's own key.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { QcallApiClient } from "./qcall-api-client.js";

const requestClientStorage = new AsyncLocalStorage<QcallApiClient>();

export function runWithApiClient<T>(client: QcallApiClient, fn: () => Promise<T>): Promise<T> {
  return requestClientStorage.run(client, fn);
}

export function getRequestApiClient(): QcallApiClient | undefined {
  return requestClientStorage.getStore();
}
