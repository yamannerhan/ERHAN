import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

function healthResponse(_req: Request, res: Response) {
  res.json({ status: "ok" });
}

router.get("/", healthResponse);
router.get("/health", healthResponse);
router.get("/healthz", healthResponse);

export default router;
