import type { Request, Response } from "express";
import { logSettlement } from "../services/settlement.service";
import { asyncHandler } from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";

export const createSettlement = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };

    const payerId = req.user!.id;
    const data = req.body;

    const settlement = await logSettlement(groupId, payerId, data);

    res.json(
      new ApiResponse(200, "Settlement logged successfully", settlement),
    );
  },
);
