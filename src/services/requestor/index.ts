import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import {
  IRequestorConfig,
  ITypedRequestor,
} from "@/types/services/requestor/request-response";

export const createRequestor = <T>(
  config?: IRequestorConfig,
): ITypedRequestor<T> => {
  const axiosInstance: AxiosInstance = axios.create(config);

  return {
    createNormalRequest: (endpoint, requestConfig = {}) => {
      return async (data) => {
        const method = requestConfig.method?.toLowerCase() || "post";

        let url = String(endpoint);
        let requestData = data;
        let params;

        // Handle URL parameters (replace {param} in URL with actual values)
        if (data && typeof data === "object") {
          Object.entries(data as Record<string, any>).forEach(
            ([key, value]) => {
              if (typeof value === "string" || typeof value === "number") {
                if (url.includes(`{${key}}`)) {
                  url = url.replace(`{${key}}`, String(value));
                  // Remove the parameter from request data since it's now in URL
                  const updatedData = { ...data } as any;
                  delete updatedData[key];
                  requestData =
                    Object.keys(updatedData).length > 0
                      ? updatedData
                      : undefined;
                }
              }
            },
          );
        }

        // For GET requests, use params instead of data
        if (method === "get") {
          params = requestData;
          requestData = undefined;
        }

        const response = await axiosInstance.request({
          ...requestConfig,
          method,
          url,
          data: requestData,
          params,
        });

        return response.data;
      };
    },
  };
};
