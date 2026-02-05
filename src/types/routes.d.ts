import { RequestHandler } from "express"

export interface RouteOptions {
  method: "GET" | "POST"
  url: string
  preHandler?: RequestHandler | RequestHandler[]
  handler: RequestHandler
}
