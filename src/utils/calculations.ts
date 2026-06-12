import { pg } from "../config/db";
import { ApiError } from "./api-response";

interface ParticipantInput {
  userId: string;
  amount?: string;
  percentage?: string;
}

interface CalculatedShare {
  userId: string;
  shareAmount: number;
}

export const toKobo = (amount: string): number =>
  Math.round(parseFloat(amount) * 100);

export const toDecimal = (amount: number): number =>
  Number((amount / 100).toFixed(2));

export const validateAndCalcShares = (
  totalAmount: string,
  splitType: "equal" | "percentage" | "exact",
  participants: ParticipantInput[],
): CalculatedShare[] => {
  const totalAmountKobo = toKobo(totalAmount);

  if (totalAmountKobo <= 0) {
    throw new ApiError(400, "Total amount must be greater than zero");
  }

  if (participants.length === 0) {
    throw new ApiError(400, "At least one participant is required");
  }

  if (splitType === "equal")
    return calcEqualShares(totalAmountKobo, participants);

  if (splitType === "exact")
    return calcExactShares(totalAmountKobo, participants);

  if (splitType === "percentage")
    return calcPercantageShares(totalAmountKobo, participants);

  throw new ApiError(400, "Invalid split type");
};

const calcEqualShares = (
  totalAmountKobo: number,
  participants: ParticipantInput[],
) => {
  const shareKobo = Math.floor(totalAmountKobo / participants.length);
  const remainderKobo = totalAmountKobo - shareKobo * participants.length;

  return participants.map((p, i) => ({
    userId: p.userId,
    shareAmount: shareKobo + (i === 0 ? remainderKobo : 0),
  }));
};

const calcExactShares = (
  totalAmountKobo: number,
  participants: ParticipantInput[],
) => {
  const shareKobo = participants.map((p) => ({
    userId: p.userId,
    shareAmountKobo: toKobo(p.amount!),
  }));

  const allocatedKobo = shareKobo.reduce(
    (sum, s) => sum + s.shareAmountKobo,
    0,
  );

  if (allocatedKobo !== totalAmountKobo)
    throw new ApiError(
      400,
      `Share amounts must equal total. Got ${toDecimal(allocatedKobo)}, expected ${toDecimal(totalAmountKobo)}`,
    );

  return shareKobo.map((s) => ({
    userId: s.userId,
    shareAmount: s.shareAmountKobo!,
  }));
};

const calcPercantageShares = (
  totalAmountKobo: number,
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

  const shareKobo = participants.map((p) => ({
    userId: p.userId,
    shareAmountKobo: (totalAmountKobo * parseFloat(p.percentage!)) / 100,
  }));

  const allocatedKobo = shareKobo.reduce(
    (sum, s) => sum + s.shareAmountKobo,
    0,
  );

  const remainderKobo = totalAmountKobo - allocatedKobo;

  return shareKobo.map((s, i) => ({
    userId: s.userId,
    shareAmount: s.shareAmountKobo + (i === 0 ? remainderKobo : 0),
  }));
};
