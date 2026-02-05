import { AxiosRequestConfig, AxiosResponse } from "axios";

export interface IRequestorConfig extends AxiosRequestConfig {
  baseURL?: string;
}

export interface ITypedRequestor<T> {
  createNormalRequest: <K extends keyof T>(
    endpoint: K,
    config?: AxiosRequestConfig,
  ) => (data?: T[K]["request"]) => Promise<T[K]["response"]>;
}
