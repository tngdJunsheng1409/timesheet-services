import cors from "cors";
import express, { json } from "express";
import serverless from "serverless-http";
import { registerAllRoutes } from "./routes";

const app = express();

app.use(json());
app.use(
  cors({
    origin: "*",
  }),
);

registerAllRoutes(app);

// ✅ Only start server locally (NOT on Vercel)
if (process.env.NODE_ENV !== "production") {
  const PORT = 9001;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// ✅ This is what Vercel uses
export default serverless(app);
