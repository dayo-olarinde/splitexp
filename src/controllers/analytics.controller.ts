import type { Request, Response } from "express";
import {
  groupAnalyticsSummary,
  groupMonthlyBreakdown,
  myAnalytics,
  personalMonthlyBreakdown,
  topSpenders,
} from "../services/analytics.service";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const getGroupAnalyticsSummary = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const analytics = await groupAnalyticsSummary(groupId);

    res.json(new ApiResponse(200, "Analytics retrieved", analytics));
  },
);

export const getMonthlyBreakdown = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const breakdown = await groupMonthlyBreakdown(groupId);

    res.json(new ApiResponse(200, "Monthly breakdown retrieved", breakdown));
  },
);

export const getTopSpenders = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const result = await topSpenders(groupId);

    res.json(new ApiResponse(200, "Top 3 spenders retrieved", result));
  },
);

export const getMyAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const userAnalytics = await myAnalytics(userId);

    res.json(new ApiResponse(200, "Analytics retrieved", userAnalytics));
  },
);

export const getUserMonthlyTrend = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const breakdown = await personalMonthlyBreakdown(userId);

    res.json(new ApiResponse(200, "User monthly trend retrieved", breakdown));
  },
);
