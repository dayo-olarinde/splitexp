import type { NextFunction, Request, Response } from "express";
import { auth } from "../config/auth";
import { ApiError } from "../utils/api-response";

import { pg } from "../config/db";
import { verifyGroup } from "../services/group.service";
import { asyncHandler } from "../utils/async-handler";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return next(
        new ApiError(401, "Authentication required. Please sign in."),
      );
    }

    req.user = session.user;
    req.session = session.session;

    return next();
  } catch (err) {
    next(new ApiError(401, "Authentication failed."));
  }
};

export const requireGroupMember = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const { groupId } = req.params as { groupId: string };

    if (!groupId) {
      return next(
        new ApiError(400, "Group ID is required to check permissions."),
      );
    }

    await verifyGroup(groupId);

    const [member] = await pg<GroupMember[]>`
      SELECT id, user_id, group_id, role, created_at
      FROM group_members
      WHERE user_id = ${userId}
        AND group_id = ${groupId}
    `;

    if (!member) {
      return next(new ApiError(404, "You are not a member of this group."));
    }

    req.member = member;

    next();
  },
);

export const requireGroupAdmin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const member = req.member;

    if (!member) {
      return next(new ApiError(500, "Member not loaded."));
    }

    if (member.role !== "admin") {
      return next(
        new ApiError(403, "You must be a group admin to perform this action."),
      );
    }

    next();
  },
);

type GroupMember = {
  id: string;
  user_id: string;
  group_id: string;
  role: "admin" | "member";
  created_at: string;
};
