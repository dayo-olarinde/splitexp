import { Router } from "express";
import {
  getMyAnalytics,
  getUserMonthlyTrend,
} from "../controllers/analytics.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/analytics", authenticate, getMyAnalytics);
router.get("/analytics/monthly", authenticate, getUserMonthlyTrend);

export default router;
