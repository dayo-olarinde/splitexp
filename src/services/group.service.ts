import { and, eq } from "drizzle-orm";
import { db, pg } from "../config/db";
import { groupMembers } from "../db/schema";
import { ApiError } from "../utils/api-response";
import { toDecimal } from "../utils/calculations";
import type {
  CreateGroupInput,
  UpdateGroupSchema,
} from "../validations/group.validation";

export const createGroupInDb = async (
  userId: string,
  data: CreateGroupInput,
) => {
  const { name, description } = data;

  const group = await pg.begin(async (tx) => {
    const [newGroup] = await tx`
      INSERT INTO groups (name, description, created_by)
      VALUES ( ${name}, ${description ?? ""}, ${userId} )
      RETURNING *
    `;
    if (!newGroup) throw new ApiError(500, "Failed to create group");

    await tx`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (${newGroup.id}, ${userId}, 'admin')
    `;

    return newGroup;
  });

  return group;
};

export const getAllUserGroups = async (userId: string) => {
  const result = await pg`
    SELECT g.id, g.name, g.description, gm.role, gm.created_at AS joined_at,
      COUNT(agm.user_id)::int AS member_count
    FROM groups g
    INNER JOIN group_members gm
      ON g.id = gm.group_id AND gm.user_id = ${userId}
    LEFT JOIN group_members agm
      ON agm.group_id = g.id
    GROUP BY g.id, g.name, g.description, gm.role, gm.created_at
    ORDER BY gm.created_at DESC
  `;

  return result;
};

export const getGroupDetails = async (groupId: string) => {
  const rows = await pg`
    SELECT 
      g.id, 
      g.name AS group_name, 
      g.description, 
      g.created_by, 
      
      gm.user_id, 
      gm.role, 
      gm.created_at AS joined_at,

           
      u.name AS user_name,
      u.email
    FROM groups g
    JOIN group_members gm
      ON gm.group_id = g.id
    JOIN "user" u 
      ON u.id = gm.user_id
    WHERE g.id = ${groupId}
    `;

  if (rows.length === 0) throw new ApiError(404, "Group does not exist");

  const formattedResponse = {
    groupId: rows[0]?.id,
    name: rows[0]?.group_name,
    description: rows[0]?.description,
    createdBy: rows[0]?.created_by,
    members: rows.map((r) => ({
      id: r.user_id,
      name: r.user_name,
      email: r.email,
      role: r.role,
      joinedAt: r.joined_at,
    })),
  };

  return formattedResponse;
};

export const updateGroupDetails = async (
  groupId: string,
  data: UpdateGroupSchema,
) => {
  await verifyGroup(groupId);
  const { name, description } = data;

  const updateData: Record<string, string> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;

  if (Object.keys(updateData).length === 0)
    throw new ApiError(400, "No fields to update");

  const [updatedGroup] = await pg`
    UPDATE groups
    SET ${pg(updateData)}
    WHERE id = ${groupId}
    RETURNING *
  `;

  if (!updatedGroup) throw new ApiError(500, "Failed to update group");

  return updatedGroup;
};

export const deleteGroup = async (groupId: string) => {
  await verifyGroup(groupId);

  const [deletedGroup] = await pg`
    DELETE FROM groups
    WHERE id = ${groupId}
    RETURNING *
  `;

  if (!deletedGroup) throw new ApiError(500, "Failed to delete group");

  return;
};

export const addNewMember = async (groupId: string, email: string) => {
  const [user] = await pg`
    SELECT id
    FROM "user"
    WHERE email = ${email}
  `;

  if (!user)
    throw new ApiError(404, "No account found with that email address");

  await verifyGroup(groupId);

  const [existingMember] = await pg`
    SELECT id
    FROM group_members
    WHERE user_id = ${user.id}
      AND group_id = ${groupId}
  `;

  if (existingMember)
    throw new ApiError(409, "This user is already a member of this group");

  const [newMember] = await pg`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (${groupId},${user.id}, 'member')
    RETURNING *
  `;

  if (!newMember) throw new ApiError(500, "Failed to add member");

  return newMember;
};

export const removeMemberById = async (groupId: string, targetId: string) => {
  const group = await verifyGroup(groupId);

  if (group.createdBy === targetId) {
    throw new ApiError(403, "The group creator cannot be removed");
  }

  const [removedMember] = await pg`
    DELETE FROM group_members
    WHERE user_id = ${targetId}
      AND group_id = ${groupId}
    RETURNING *
  `;

  if (!removedMember) throw new ApiError(404, "Member not found in this group");

  return removedMember;
};

export const changeMemberRole = async (
  groupId: string,
  userId: string,
  role: "admin" | "member",
) => {
  const group = await verifyGroup(groupId);

  if (group.createdBy === userId)
    throw new ApiError(400, "The group creator's role cannot be changed");

  const [updatedMember] = await db
    .update(groupMembers)
    .set({ role })
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .returning();

  if (!updatedMember) throw new ApiError(500, "Failed to update member role");

  return updatedMember;
};

export const leaveTheGroup = async (
  groupId: string,
  userId: string,
  role: "admin" | "member",
) => {
  if (role === "admin") {
    const [adminCount] = await pg`
      SELECT
        COALESCE(COUNT(gm.id), 0) AS count
      FROM group_members gm
      WHERE gm.group_id = ${groupId} 
        AND gm.role = 'admin'
      `;

    if (Number(adminCount?.count) <= 1) {
      throw new ApiError(
        400,
        "You are the last admin. Promote another member or delete the group.",
      );
    }
  }

  const [balance] = await pg`
      SELECT 
        COALESCE(SUM(le.amount)::int, 0) AS net_balance 
      FROM ledger_entries le
      JOIN transactions t ON t.id = le.transaction_id
      WHERE le.group_id = ${groupId}
        AND le.user_id = ${userId}
        AND t.status = 'confirmed' 
    `;

  const netBalance = balance?.net_balance ?? 0;

  if (netBalance !== 0) {
    throw new ApiError(
      400,
      `Cannot leave the group. You have an outstanding balance of ${toDecimal(Math.abs(netBalance))}.`,
    );
  }

  await pg`
    DELETE FROM group_members
    WHERE user_id = ${userId}
      AND group_id = ${groupId}
  `;

  return;
};

export const groupTransactions = async (
  groupId: string,
  limit: number = 10,
  cursor?: string,
) => {
  await verifyGroup(groupId);

  const transactions = await pg`
    SELECT 
      t.id,
      t.type,
      t.status,
      t.description,
      t.total_amount AS amount,
      t.created_at AS created,
      COALESCE(t.category, 'Uncategorised') as category,

      u_payer.id AS payer_id,
      u_payer.name AS payer_name,

      u_payee.id AS payee_id,
      u_payee.name AS payee_name
    FROM transactions t
    JOIN "user" u_payer
      ON u_payer.id = t.payer_id 
    LEFT JOIN "user" u_payee
      ON u_payee.id = t.payee_id 
    WHERE t.group_id = ${groupId}
      ${cursor ? pg`AND t.created_at < ${cursor}::timestamptz` : pg``}
    ORDER BY t.created_at DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = transactions.length > limit;
  if (hasMore) transactions.pop();

  const formattedTransactions = transactions.map(
    ({
      payer_id,
      payer_name,
      payee_id,
      payee_name,
      amount,
      created,
      ...rest
    }) => ({
      ...rest,
      amount: toDecimal(amount),
      payer: { id: payer_id, name: payer_name },
      payee: { id: payee_id, name: payee_name },
      created: new Date(created).toLocaleDateString(),
    }),
  );

  const nextCursor = hasMore
    ? transactions[transactions.length - 1]?.created
    : null;

  return {
    transactions: formattedTransactions,
    pagination: {
      hasMore,
      nextCursor,
      limit,
    },
  };
};

export const verifyGroup = async (groupId: string) => {
  const [group] = await pg`
    SELECT id, name, description, created_by
    FROM groups
    WHERE id = ${groupId}
  `;

  if (!group) throw new ApiError(404, "Group does not exist");

  return { ...group, createdBy: group.created_by };
};
