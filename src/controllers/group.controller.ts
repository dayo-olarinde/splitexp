import type { Request, Response, NextFunction } from "express";
import {
  addNewMember,
  changeMemberRole,
  createGroupInDb,
  deleteGroupById,
  getAllUserGroups,
  getGroupDetails,
  leaveTheGroup,
  removeMemberById,
  updateGroupDetails,
} from "../services/group.service";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, description } = req.body;

  const group = await createGroupInDb(userId, name, description);

  res
    .status(201)
    .json(new ApiResponse(201, "Group created successfully", group));
});

export const getGroups = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const groups = await getAllUserGroups(userId);

  res.json(new ApiResponse(200, "Groups retrieved successfully", groups));
});

export const getGroupById = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };

    const groupDetails = await getGroupDetails(groupId);

    res.json(new ApiResponse(200, "Group fetched successfully", groupDetails));
  },
);

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params as { groupId: string };

  const updatedGroup = await updateGroupDetails(groupId, req.body);

  res.json(new ApiResponse(200, "Group updated successfully", updatedGroup));
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params as { groupId: string };

  await deleteGroupById(groupId);

  res.json(new ApiResponse(204, "Group deleted successfully"));
});

export const addMember = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params as { groupId: string };
  const { email } = req.body;

  const newMember = await addNewMember(groupId, email);

  res
    .status(201)
    .json(new ApiResponse(201, "Member added successfully", newMember));
});

export const removeMember = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId, userId: targetUserId } = req.params as {
      groupId: string;
      userId: string;
    };

    const removedMember = await removeMemberById(groupId, targetUserId);

    res.json(
      new ApiResponse(200, "Member removed successfully", removedMember),
    );
  },
);

export const changeRole = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, userId: targetUserId } = req.params as {
    groupId: string;
    userId: string;
  };
  const { role } = req.body;

  const updatedMember = await changeMemberRole(groupId, targetUserId, role);

  res.json(
    new ApiResponse(200, "Member role changed successfully", updatedMember),
  );
});

export const leaveGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { groupId } = req.params as { groupId: string };

  await leaveTheGroup(groupId, userId);

  res.json(new ApiResponse(200, "Left group successfully"));
});
