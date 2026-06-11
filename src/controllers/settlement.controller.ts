import type { Request, Response } from "express";
import {
  // getSettlementDetail,
  // listGroupSettlements,
  logSettlement,
  updateTransactionStatus,
  // updateSettlementStatus,
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

// export const listSettlements = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId } = req.params as { groupId: string };
//     const settlements = await listGroupSettlements(groupId);

//     res.json(new ApiResponse(200, "Settlements retrieved", settlements));
//   },
// );

export const confirmSettlement = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { groupId, transactionId } = req.params as {
      groupId: string;
      transactionId: string;
    };
    const transaction = await updateTransactionStatus(
      userId,
      groupId,
      transactionId,
    );

    res.json(new ApiResponse(200, "Transaction confirmed", transaction));
  },
);

// export const getSettlement = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = req.user!.id;
//     const { groupId, settlementId } = req.params as {
//       groupId: string;
//       settlementId: string;
//     };
//     const settlement = await getSettlementDetail(userId, groupId, settlementId);

//     res.json(new ApiResponse(200, "Settlement details retrieved", settlement));
//   },
// );
