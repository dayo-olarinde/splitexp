import { ApiError } from "./api-response";

interface ParticipantInput {
  userId: string;
  amount?: string;
  percentage?: string;
}

interface CalculatedShare {
  userId: string;
  shareAmount: string;
}

export const toCents = (amount: string): number =>
  Math.round(parseFloat(amount) * 100);

export const toDecimal = (amount: number): string => (amount / 100).toFixed(2);

export const validateAndCalcShares = (
  totalAmount: string,
  splitType: "equal" | "percentage" | "exact",
  participants: ParticipantInput[],
): CalculatedShare[] => {
  const totalAmountCents = toCents(totalAmount);

  if (totalAmountCents <= 0) {
    throw new ApiError(400, "Total amount must be greater than zero");
  }

  if (participants.length === 0) {
    throw new ApiError(400, "At least one participant is required");
  }

  if (splitType === "equal")
    return calcEqualShares(totalAmountCents, participants);

  if (splitType === "exact")
    return calcExactShares(totalAmountCents, participants);

  if (splitType === "percentage")
    return calcPercantageShares(totalAmountCents, participants);

  throw new ApiError(400, "Invalid split type");
};

const calcEqualShares = (
  totalAmountCents: number,
  participants: ParticipantInput[],
) => {
  const shareCents = Math.floor(totalAmountCents / participants.length);
  const remaindercents = totalAmountCents - shareCents * participants.length;

  return participants.map((p, i) => ({
    userId: p.userId,
    shareAmount: toDecimal(shareCents + (i === 0 ? remaindercents : 0)),
  }));
};

const calcExactShares = (
  totalAmountCents: number,
  participants: ParticipantInput[],
) => {
  const shareCents = participants.map((p) => ({
    userId: p.userId,
    shareAmountCents: toCents(p.amount!),
  }));

  const allocatedCents = shareCents.reduce(
    (sum, s) => sum + s.shareAmountCents,
    0,
  );

  if (allocatedCents !== totalAmountCents)
    throw new ApiError(
      400,
      `Share amounts must equal total. Got ${toDecimal(allocatedCents)}, expected ${toDecimal(totalAmountCents)}`,
    );

  return shareCents.map((s) => ({
    userId: s.userId,
    shareAmount: toDecimal(s.shareAmountCents!),
  }));
};

const calcPercantageShares = (
  totalAmountCents: number,
  participants: ParticipantInput[],
) => {
  const totalPercentages = participants.reduce(
    (sum, p) => sum + parseFloat(p.percentage!),
    0,
  );

  if (Math.abs(totalPercentages - 100) > 0.01)
    throw new ApiError(
      400,
      `Percentages must sum to 100, got ${totalPercentages}`,
    );

  const shareCents = participants.map((p) => ({
    userId: p.userId,
    shareAmountCents: (totalAmountCents * parseFloat(p.percentage!)) / 100,
  }));

  const allocatedCents = shareCents.reduce(
    (sum, s) => sum + s.shareAmountCents,
    0,
  );

  const remainderCents = totalAmountCents - allocatedCents;

  return shareCents.map((s, i) => ({
    userId: s.userId,
    shareAmount: toDecimal(s.shareAmountCents + (i === 0 ? remainderCents : 0)),
  }));
};
