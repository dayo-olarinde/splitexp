import { Router } from "express";
import {
  addMember,
  changeRole,
  createGroup,
  deleteGroupById,
  getGroupById,
  getGroups,
  getGroupTransactions,
  leaveGroup,
  removeMember,
  updateGroup,
} from "../controllers/group.controller";
import {
  authenticate,
  requireGroupAdmin,
  requireGroupMember,
} from "../middleware/auth.middleware";
import { createGroupLimiter } from "../middleware/rate-limit.middleware";
import {
  validateInput,
  validateUrlParams,
} from "../middleware/validation.middleware";
import {
  addMemberToGroup,
  changeRoleSchema,
  createGroupSchema,
  updateGroupSchema,
} from "../validations/group.validation";
import { urlParamsSchema } from "../validations/urlParams.validations";

const router = Router();

router.post(
  "/",
  authenticate,
  createGroupLimiter,
  validateInput(createGroupSchema),
  createGroup,
);

router.get("/", authenticate, getGroups);

router.get(
  "/:groupId",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getGroupById,
);

router.patch(
  "/:groupId",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  requireGroupAdmin,
  validateInput(updateGroupSchema),
  updateGroup,
);

router.delete(
  "/:groupId",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  requireGroupAdmin,
  deleteGroupById,
);

router.post(
  "/:groupId/members/",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  requireGroupAdmin,
  validateInput(addMemberToGroup),
  addMember,
);

router.delete(
  "/:groupId/members/:userId",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  requireGroupAdmin,
  removeMember,
);

router.patch(
  "/:groupId/members/:userId",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  requireGroupAdmin,
  validateInput(changeRoleSchema),
  changeRole,
);

router.post(
  "/:groupId/leave",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  leaveGroup,
);

router.get(
  "/:groupId/transactions",
  authenticate,
  validateUrlParams(urlParamsSchema),
  requireGroupMember,
  getGroupTransactions,
);

export default router;
