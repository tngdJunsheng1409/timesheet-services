import { z } from "zod/v4"

export type TApiSchemaConvertor<schema> = schema extends {
  request: infer Req
  response: infer Res
}
  ? {
      request: z.input<Req>
      response: z.output<Res>
    }
  : never

export type TApiMapSchemaConvertor<mapSchema> = {
  [x in keyof mapSchema]: TApiSchemaConvertor<mapSchema[x]>
}

export interface IApiMapSchema {
  [key: string]: {
    request: z.ZodType
    response: z.ZodType
  }
}
