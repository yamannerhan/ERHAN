import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function healthResponse(_req: unknown, res: { json: (data: unknown) => void }) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

router.get("/health", healthResponse);
router.get("/healthz", healthResponse);

export default router;
