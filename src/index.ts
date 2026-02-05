import cors from "cors";
import express, { json } from "express";
import { registerAllRoutes } from "./routes";

const startServer = () => {
  const app = express();
  app.use(json());
  app.use(
    cors({
      origin: "*",
    }),
  );

  registerAllRoutes(app);

  app.listen({ port: 9001 }, (err) => {
    if (err) {
      console.log("🚀 ~ app.listen ~ err:", err);
      process.exit(1);
    }
    console.log("🚀 ~ Server is running on http://localhost:9001");
  });
};

startServer();
