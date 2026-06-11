import { Router } from "express";
import {
  getGroupBalances,
  getMyGroupBalances,
  getSimplifiedBalances,
} from "../controllers/balances.controller";
import {
  authenticate,
  requireGroupMember,
} from "../middleware/auth.middleware";
import { validateUrlParams } from "../middleware/validation.middleware";
import { urlParamsSchema } from "../validations/urlParams.validations";

const router = Router({ mergeParams: true });

router.get(
  "/balances",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getGroupBalances,
);

router.get(
  "/balances/simplified",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getSimplifiedBalances,
);

router.get(
  "/balances/me",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getMyGroupBalances,
);

export default router;
