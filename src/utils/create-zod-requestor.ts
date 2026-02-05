import { ToolboxError } from "./toolbox-error";
import { createRequestor } from "@/services/requestor";
import { IRequestorConfig } from "@/types/services/requestor/request-response";
import {
  IApiMapSchema,
  TApiMapSchemaConvertor,
} from "@/types/utils/zod-requestor";

export const createZodRequestor = <
  S extends IApiMapSchema,
  ApiMap extends TApiMapSchemaConvertor<S>,
>(
  apiMapSchema: S,
  config?: IRequestorConfig,
) => {
  const requestor = createRequestor<ApiMap>(config);

  return {
    createNormalRequest: <K extends keyof S>(
      endpoint: K,
      requestConfig?: any,
    ) => {
      const originalRequest = requestor.createNormalRequest(
        endpoint,
        requestConfig,
      );

      return async (data?: any) => {
        const apiSchema = apiMapSchema[endpoint];

        if (!apiSchema) {
          throw new ToolboxError(
            500,
            `API schema not found for endpoint: ${String(endpoint)}`,
          );
        }

        // Validate request data if provided
        if (data && apiSchema.request) {
          const requestValidation = apiSchema.request.safeParse(data);
          if (!requestValidation.success) {
            console.error("Request validation error:", {
              endpoint,
              data,
              errors: requestValidation.error.issues,
            });
            throw new ToolboxError(
              400,
              `Request validation failed for ${String(endpoint)}`,
              requestValidation.error.issues,
            );
          }
          data = requestValidation.data;
        }

        // Make the request
        const response = await originalRequest(data);

        // Validate response data
        if (apiSchema.response) {
          const responseValidation = apiSchema.response.safeParse(response);
          if (!responseValidation.success) {
            console.error("Response validation error:", {
              endpoint,
              response,
              errors: responseValidation.error.issues,
            });
            throw new ToolboxError(
              500,
              `Response validation failed for ${String(endpoint)}`,
              responseValidation.error.issues,
            );
          }
          return responseValidation.data;
        }

        return response;
      };
    },
  };
};
