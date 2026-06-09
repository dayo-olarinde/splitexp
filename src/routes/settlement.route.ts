import { Router } from "express";
import { createSettlement } from "../controllers/settlement.controller";
import {
  authenticate,
  requireGroupMember,
} from "../middleware/auth.middleware";
import {
  validateInput,
  validateUrlParams,
} from "../middleware/validation.middleware";
import { createSettlementSchema } from "../validations/settlement.validation";
import { urlParamsSchema } from "../validations/urlParams.validations";

const router = Router({ mergeParams: true });

router.post(
  "/settlements",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  validateInput(createSettlementSchema),
  createSettlement,
);

export default router;
