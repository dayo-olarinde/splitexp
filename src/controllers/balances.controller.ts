import type { Request, Response } from "express";
import {
  groupTotalBalances,
  simplifiedBalances,
  userBalancesInGroup,
} from "../services/balances.service";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const getGroupBalances = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const balances = await groupTotalBalances(groupId);

    res.json(new ApiResponse(200, "Balances retrieved", balances));
  },
);

export const getSimplifiedBalances = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const result = await simplifiedBalances(groupId);

    res.json(new ApiResponse(200, "Simplified settlements retrieved", result));
  },
);

export const getMyGroupBalances = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { groupId } = req.params as { groupId: string };

    const myBalances = await userBalancesInGroup(groupId, userId);

    res.json(
      new ApiResponse(
        200,
        "Your group balances retrieved successfully",
        myBalances,
      ),
    );
  },
);
