import { Router } from "express";
import {
  createExpense,
  deleteExpenseById,
  getExpenseDetails,
  listGroupExpenses,
} from "../controllers/expense.controller";
import {
  authenticate,
  requireGroupMember,
} from "../middleware/auth.middleware";
import { financialTransactionLimiter } from "../middleware/rate-limit.middleware";
import {
  validateInput,
  validateUrlParams,
} from "../middleware/validation.middleware";
import { createExpenseSchema } from "../validations/expense.validation";
import { urlParamsSchema } from "../validations/urlParams.validations";

const router = Router({ mergeParams: true });

router.post(
  "/expenses",
  authenticate,
  financialTransactionLimiter,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  validateInput(createExpenseSchema),
  createExpense,
);

router.get(
  "/expenses",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  listGroupExpenses,
);

router.get(
  "/expenses/:expenseId",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getExpenseDetails,
);

router.delete(
  "/expenses/:expenseId",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  deleteExpenseById,
);

export default router;
