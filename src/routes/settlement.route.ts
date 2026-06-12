import { Router } from "express";
import {
  confirmUserSettlement,
  createSettlement,
  // getSettlement,
  // listSettlements,
} from "../controllers/settlement.controller";
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

// router.get(
//   "/settlements",
//   authenticate,
//   validateUrlParams(urlParamsSchema),
//   requireGroupMember,
//   listSettlements,
// );

router.patch(
  "/settlements/:settlementId/confirm",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  confirmUserSettlement,
);

// router.get(
//   "/settlements/:settlementId",
//   authenticate,
//   validateUrlParams(urlParamsSchema),
//   requireGroupMember,
//   getSettlement,
// );

export default router;
