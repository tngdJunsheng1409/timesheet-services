import cors from "cors";
import express, { json } from "express";
import serverless from "serverless-http";
import { registerAllRoutes } from "../src/routes";

const app = express();

app.use(json());
app.use(
  cors({
    origin: "*",
  }),
);

registerAllRoutes(app);

export default serverless(app);
