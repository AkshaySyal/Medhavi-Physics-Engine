import { Router, type IRouter } from "express";
import healthRouter from "./health";
import anthropicRouter from "./anthropic";
import physicsRouter from "./physics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(anthropicRouter);
router.use(physicsRouter);

export default router;
