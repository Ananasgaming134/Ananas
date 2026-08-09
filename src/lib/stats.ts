import { prisma } from "@/lib/prisma";
import { LOAN_STATUS, MEMBER_STATUS, ROLES } from "@/lib/constants";

export async function getPublicStats() {
  const [items, activeMembers, kunden, activeLoans] = await Promise.all([
    prisma.item.findMany({ select: { averagePrice: true, quantityTotal: true } }),
    prisma.member.count({ where: { status: MEMBER_STATUS.ACTIVE } }),
    prisma.member.count({ where: { status: MEMBER_STATUS.ACTIVE, role: ROLES.KUNDE } }),
    prisma.loan.count({ where: { status: LOAN_STATUS.ACTIVE } }),
  ]);

  const totalValue = items.reduce(
    (sum, item) => sum + (item.averagePrice ?? 0) * item.quantityTotal,
    0
  );
  const totalQuantity = items.reduce((sum, item) => sum + item.quantityTotal, 0);

  return {
    totalValue,
    itemCount: items.length,
    totalQuantity,
    activeMembers,
    kundenCount: kunden,
    activeLoans,
  };
}
