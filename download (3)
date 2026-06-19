import { db, employeesTable, responsesTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";

export async function getAllEmployees() {
  return db.select().from(employeesTable);
}

export async function getEmployeeByTelegramId(telegramId: number) {
  const rows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.telegramId, telegramId));
  return rows[0] ?? null;
}

export async function addEmployee(telegramId: number, name: string, username?: string) {
  const existing = await getEmployeeByTelegramId(telegramId);
  if (existing) return existing;
  const rows = await db
    .insert(employeesTable)
    .values({ telegramId, name, username })
    .returning();
  return rows[0]!;
}

export async function removeEmployee(telegramId: number) {
  const rows = await db
    .delete(employeesTable)
    .where(eq(employeesTable.telegramId, telegramId))
    .returning();
  return rows[0] ?? null;
}

function todayRange() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

export async function saveMetricResponse(
  employeeId: number,
  telegramId: number,
  sessionType: string,
  metric: string,
  answer: string,
) {
  await db.insert(responsesTable).values({
    employeeId,
    telegramId,
    sessionType,
    metric,
    answer,
  });
}

/** Обновить ответ (удаляет старый за сегодня и вставляет новый) */
export async function upsertMetricResponse(
  employeeId: number,
  telegramId: number,
  sessionType: string,
  metric: string,
  answer: string,
) {
  const { startOfDay, endOfDay } = todayRange();

  await db.delete(responsesTable).where(
    and(
      eq(responsesTable.employeeId, employeeId),
      eq(responsesTable.sessionType, sessionType),
      eq(responsesTable.metric, metric),
      gte(responsesTable.answeredAt, startOfDay),
      lte(responsesTable.answeredAt, endOfDay),
    ),
  );

  await db.insert(responsesTable).values({
    employeeId,
    telegramId,
    sessionType,
    metric,
    answer,
  });
}

/** Удалить все ответы за сегодня (или только по конкретной сессии) */
export async function clearTodayResponses(sessionType?: string) {
  const { startOfDay, endOfDay } = todayRange();

  const conditions = [
    gte(responsesTable.answeredAt, startOfDay),
    lte(responsesTable.answeredAt, endOfDay),
  ] as ReturnType<typeof eq>[];

  if (sessionType) {
    conditions.push(eq(responsesTable.sessionType, sessionType));
  }

  const deleted = await db
    .delete(responsesTable)
    .where(and(...conditions))
    .returning();

  return deleted.length;
}

export async function getTodaySessionResponses(sessionType: string) {
  const { startOfDay, endOfDay } = todayRange();

  return db
    .select({
      telegramId: responsesTable.telegramId,
      metric: responsesTable.metric,
      answer: responsesTable.answer,
      answeredAt: responsesTable.answeredAt,
      name: employeesTable.name,
      username: employeesTable.username,
    })
    .from(responsesTable)
    .innerJoin(employeesTable, eq(responsesTable.employeeId, employeesTable.id))
    .where(
      and(
        eq(responsesTable.sessionType, sessionType),
        gte(responsesTable.answeredAt, startOfDay),
        lte(responsesTable.answeredAt, endOfDay),
      ),
    );
}
