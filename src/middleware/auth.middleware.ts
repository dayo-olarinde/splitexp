import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-response";
import { auth } from "../config/auth";

import { and, eq } from "drizzle-orm";
import { groupMembers } from "../db/schema";
import { db } from "../config/db";
import { asyncHandler } from "../utils/async-handler";
import { verifyGroup } from "../services/group.service";

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

export const requireGroupAdmin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const { groupId } = req.params;

    if (!groupId) {
      return next(
        new ApiError(400, "Group ID is required to check permissions."),
      );
    }

    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId as string),
          eq(groupMembers.userId, userId),
        ),
      );

    if (!member) {
      return next(new ApiError(404, "You are not a member of this group."));
    }

    if (member.role !== "admin") {
      return next(
        new ApiError(403, "You must be a group admin to perform this action."),
      );
    }

    next();
  },
);

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

    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId as string),
          eq(groupMembers.userId, userId),
        ),
      );

    if (!member) {
      return next(new ApiError(404, "You are not a member of this group."));
    }

    req.member = member;

    next();
  },
);
