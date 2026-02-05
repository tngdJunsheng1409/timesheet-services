import { Express } from "express";
import type { NextFunction, Request, Response } from "express";
import { timesheetControllers } from "@/controllers/timesheet.controller";

export const registerAllRoutes = (app: Express) => {
  const allControllers = [...timesheetControllers];

  allControllers.forEach(({ url, method, handler, preHandler }) => {
    const preHandlers = (
      Array.isArray(preHandler) ? preHandler : preHandler ? [preHandler] : []
    ).map((handler) => {
      return async (req: Request, res: Response, next: NextFunction) => {
        const caller = async () => {
          try {
            await handler.apply(app, [req, res, next]);
          } catch (error) {
            next(error);
          }
        };

        await caller();
      };
    });

    app[method === "POST" ? "post" : "get"].apply(app, [
      url,
      // @ts-expect-error the improper type definition of express, but it is supported usage
      ...preHandlers,
      handler.bind(app),
    ]);
  });
};
