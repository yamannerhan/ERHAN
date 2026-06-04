import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import listingsRouter from "./listings";
import chatRouter from "./chat";
import usersRouter from "./users";
import notificationsRouter from "./notifications";
import announcementsRouter from "./announcements";
import adminRouter from "./admin";
import supportRouter from "./support";
import parttimeRouter from "./parttime";
import sourcesRouter from "./sources";
import pendingJobsRouter from "./pending-jobs";
import telegramAuthRouter from "./telegram-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(listingsRouter);
router.use(chatRouter);
router.use(usersRouter);
router.use(notificationsRouter);
router.use(announcementsRouter);
router.use(adminRouter);
router.use(supportRouter);
router.use(parttimeRouter);
router.use(sourcesRouter);
router.use(pendingJobsRouter);
router.use(telegramAuthRouter);

export default router;
