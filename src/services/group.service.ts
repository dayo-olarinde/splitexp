import { and, eq } from "drizzle-orm";
import { db, pg } from "../config/db";
import { groupMembers, groups, user } from "../db/schema";
import { ApiError } from "../utils/api-response";
import { toKobo, toDecimal } from "../utils/calculations";
import type { UpdateGroupSchema } from "../validations/group.validation";

export const createGroupInDb = async (
  userId: string,
  name: string,
  description?: string,
) => {
  const newGroup = await db.transaction(async (tx) => {
    const [group] = await tx
      .insert(groups)
      .values({
        name,
        description,
        createdBy: userId,
      })
      .returning();

    if (!group) throw new ApiError(500, "Failed to create group");

    await tx.insert(groupMembers).values({
      groupId: group.id,
      userId: userId,
      role: "admin",
    });

    return group;
  });

  return newGroup;
};

export const getAllUserGroups = async (userId: string) => {
  const allGroups = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      role: groupMembers.role,
      joinedAt: groupMembers.createdAt,
    })
    .from(groups)
    .innerJoin(groupMembers, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId));

  return allGroups;
};

export const getAllUserGroupss = async (userId: string) => {
  const result = await pg`
    SELECT
      g.id,
      g.name,
      g.description,
      gm.role,
      gm.created_at AS joined_at,
      COUNT(all_members.user_id) AS member_count
    FROM groups g
    INNER JOIN group_members gm
      ON g.id = gm.group_id AND gm.user_id = ${userId}
    LEFT JOIN group_members all_members
      ON g.id = all_members.group_id
    GROUP BY g.id, g.name, g.description, gm.role, gm.created_at
    ORDER BY gm.created_at DESC
  `;

  return result;
};

export const getGroupDetails = async (groupId: string) => {
  const group = await verifyGroup(groupId);

  const members = await pg`
    SELECT
      gm.user_id,
      gm.role,
      gm.created_at AS joined_at,
      u.name,
      u.email
    FROM group_members gm
    INNER JOIN "user" u 
      ON gm.user_id = u.id
    WHERE gm.group_id = ${groupId}
    `;

  return { ...group, members: members };
};

export const updateGroupDetails = async (
  groupId: string,
  data: UpdateGroupSchema,
) => {
  await verifyGroup(groupId);

  const [updatedGroup] = await db
    .update(groups)
    .set({
      ...(data.name && { name: data.name }),
      ...(data.description && { description: data.description }),
    })
    .where(eq(groups.id, groupId))
    .returning();

  if (!updatedGroup) throw new ApiError(500, "Failed to update group");

  return updatedGroup;
};

export const deleteGroupById = async (groupId: string) => {
  await verifyGroup(groupId);

  const [deletedGroup] = await db
    .delete(groups)
    .where(eq(groups.id, groupId))
    .returning();

  if (!deletedGroup) throw new ApiError(500, "Failed to delete group");

  return;
};

export const addNewMember = async (groupId: string, email: string) => {
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!existingUser)
    throw new ApiError(404, "No account found with that email address");

  await verifyGroup(groupId);

  const [existingMember] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.userId, existingUser.id),
        eq(groupMembers.groupId, groupId),
      ),
    )
    .limit(1);

  if (existingMember)
    throw new ApiError(409, "This user is already a member of this group");

  const [newMember] = await db
    .insert(groupMembers)
    .values({
      groupId,
      userId: existingUser.id,
      role: "member",
    })
    .returning();

  if (!newMember) throw new ApiError(500, "Failed to add member");

  return newMember;
};

export const removeMemberById = async (
  groupId: string,
  targetUserId: string,
) => {
  const group = await verifyGroup(groupId);

  if (group.createdBy === targetUserId) {
    throw new ApiError(403, "The group creator cannot be removed");
  }
  const [removedMember] = await db
    .delete(groupMembers)
    .where(
      and(
        eq(groupMembers.userId, targetUserId),
        eq(groupMembers.groupId, groupId),
      ),
    )
    .returning();

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

  if (!updatedMember) throw new ApiError(500, "Failed to remove member");

  return updatedMember;
};

export const leaveTheGroup = async (groupId: string, userId: string) => {
  await verifyGroup(groupId);

  const [member] = await db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)),
    );

  if (!member) throw new ApiError(404, "You are not a member of this group");

  if (member?.role === "admin") {
    const adminCount = await pg`
      SELECT
        COALESCE(COUNT(gm.id), 0) AS count
      FROM group_members gm
      WHERE gm.group_id = ${groupId} AND gm.role = 'admin'
      `;

    if (Number(adminCount[0]?.count) <= 1) {
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
      `Cannot leave the group. You have an outstanding balance of ${toDecimal(Math.abs(netBalance))}. Please settle all debts first.`,
    );
  }

  await db
    .delete(groupMembers)
    .where(
      and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)),
    )
    .returning();

  return;
};

export const verifyGroup = async (groupId: string) => {
  const [group] = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      createdBy: groups.createdBy,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new ApiError(404, "Group does not exist");

  return group;
};
