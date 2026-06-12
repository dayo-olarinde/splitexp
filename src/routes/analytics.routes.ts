import { Router } from "express";
import {
  getGroupAnalyticsSummary,
  getMonthlyBreakdown,
  getTopSpenders,
} from "../controllers/analytics.controller";
import {
  authenticate,
  requireGroupMember,
} from "../middleware/auth.middleware";
import { validateUrlParams } from "../middleware/validation.middleware";
import { urlParamsSchema } from "../validations/urlParams.validations";

const router = Router({ mergeParams: true });

router.get(
  "/analytics/summary",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getGroupAnalyticsSummary,
);

router.get(
  "/analytics/monthly",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getMonthlyBreakdown,
);

router.get(
  "/analytics/top-spenders",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getTopSpenders,
);

export default router;
