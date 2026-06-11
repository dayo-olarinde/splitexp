import type { Request, Response } from "express";
import { logExpense } from "../services/expense.service";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const createExpense = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params as { groupId: string };
    const data = req.body;

    const expense = await logExpense(groupId, data);

    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          "Expense transaction logged successfully",
          expense,
        ),
      );
  },
);

// export const listExpenses = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId } = req.params as { groupId: string };
//     const cursor = req.query.cursor as string | undefined;
//     const limit = parseInt(req.query.limit as string) || 10;

//     const expenses = await listGroupExpenses(groupId, cursor, limit);

//     res.json(
//       new ApiResponse(200, "Group Expenses fetched successfully", expenses),
//     );
//   },
// );

// export const getExpense = asyncHandler(async (req: Request, res: Response) => {
//   const { groupId, expenseId } = req.params as {
//     groupId: string;
//     expenseId: string;
//   };

//   const expense = await getExpenseDetails(groupId, expenseId);

//   res.json(new ApiResponse(200, "Expense retrieved successfully", expense));
// });

// export const deleteExpense = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId, expenseId } = req.params as {
//       groupId: string;
//       expenseId: string;
//     };

//     const userId = req.user!.id;
//     const userRole = req.member!.role;

//     await deleteExpenseById(userId, userRole, groupId, expenseId);

//     res.json(new ApiResponse(200, "Expense deleted successfully", null));
//   },
// );
