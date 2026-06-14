import type { Request, Response } from "express";
import {
  confirmSettlement,
  logSettlement,
  rejectSettlement,
  fetchGroupSettlements,
  settlementDetail,
} from "../services/settlement.service";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const createSettlement = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const payerId = req.user!.id;
    const data = req.body;

    const settlement = await logSettlement(groupId, payerId, data);

    res.json(new ApiResponse(200, "Settlement logged", settlement));
  },
);

export const getGroupSettlements = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const settlements = await fetchGroupSettlements(groupId);

    res.json(new ApiResponse(200, "Settlements retrieved", settlements));
  },
);

export const confirmUserSettlement = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { groupId, settlementId } = req.params as {
      groupId: string;
      settlementId: string;
    };
    const settlement = await confirmSettlement(userId, groupId, settlementId);

    res.json(new ApiResponse(200, "Settlement confirmed", settlement));
  },
);

export const rejectPendingSettlement = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { groupId, settlementId } = req.params as {
      groupId: string;
      settlementId: string;
    };
    const settlement = await rejectSettlement(userId, groupId, settlementId);

    res.json(new ApiResponse(200, "Settlement rejected", settlement));
  },
);

export const getSettlementDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { groupId, settlementId } = req.params as {
      groupId: string;
      settlementId: string;
    };
    const settlement = await settlementDetail(userId, groupId, settlementId);

    res.json(new ApiResponse(200, "Settlement details retrieved", settlement));
  },
);
