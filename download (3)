import TelegramBot from "node-telegram-bot-api";
import cron from "node-cron";
import {
  SESSIONS,
  SESSION_LABELS,
  METRIC_EMOJIS,
  mskCronToUtc,
  type SessionType,
} from "./questions.js";
import {
  getAllEmployees,
  getEmployeeByTelegramId,
  addEmployee,
  removeEmployee,
  saveMetricResponse,
  upsertMetricResponse,
  clearTodayResponses,
  getTodaySessionResponses,
} from "./db.js";
import { logger } from "../lib/logger.js";

const TOKEN = process.env["TELEGRAM_BOT_TOKEN"];

/** Общая группа менеджеров — сюда идут анонсы с кнопкой */
const GROUP_CHAT_ID = process.env["TELEGRAM_REPORT_CHAT_ID"];

/** Чат руководства — сюда идут сводки */
const LEADERSHIP_CHAT_ID = process.env["TELEGRAM_LEADERSHIP_CHAT_ID"];

if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!GROUP_CHAT_ID) throw new Error("TELEGRAM_REPORT_CHAT_ID is required");
if (!LEADERSHIP_CHAT_ID) throw new Error("TELEGRAM_LEADERSHIP_CHAT_ID is required");

const ADMIN_IDS = process.env["TELEGRAM_ADMIN_IDS"]
  ? process.env["TELEGRAM_ADMIN_IDS"].split(",").map(Number)
  : [];

interface PendingState {
  sessionType: SessionType;
  metrics: string[];
  currentIndex: number;
  isUpdate?: boolean;
}

const pendingStates = new Map<number, PendingState>();

export function startBot() {
  const bot = new TelegramBot(TOKEN!, { polling: true });
  logger.info("Telegram bot started");

  function isAdmin(id: number) {
    return ADMIN_IDS.includes(id);
  }

  const escapeMd = (s: string) => s.replace(/[_*`\[]/g, "\\$&");

  /** Задать следующий вопрос по метрике */
  async function askNextMetric(telegramId: number, state: PendingState) {
    const metric = state.metrics[state.currentIndex]!;
    const emoji = METRIC_EMOJIS[metric] ?? "📌";
    const total = state.metrics.length;
    const current = state.currentIndex + 1;
    const prefix = state.isUpdate ? "✏️ *Дополнение отчёта*\n\n" : "";

    await bot.sendMessage(
      telegramId,
      `${prefix}${emoji} *${metric}* (${current}/${total})\n\nВведи свой ответ:`,
      {
        parse_mode: "Markdown",
        reply_markup: { force_reply: true },
      },
    );
  }

  /** Начать сессию опроса с менеджером в ЛС */
  async function startDmSession(
    telegramId: number,
    session: typeof SESSIONS[0],
    isUpdate = false,
  ) {
    const emp = await getEmployeeByTelegramId(telegramId);
    if (!emp) {
      await bot.sendMessage(
        telegramId,
        `❌ Тебя нет в команде.\nТвой ID: \`${telegramId}\`\nОтправь его руководителю.`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    const state: PendingState = {
      sessionType: session.type,
      metrics: session.metrics,
      currentIndex: 0,
      isUpdate,
    };
    pendingStates.set(telegramId, state);

    if (isUpdate) {
      await bot.sendMessage(
        telegramId,
        `✏️ *Дополнение отчёта: ${SESSION_LABELS[session.type]}*\n\nОтвечай на вопросы — твои данные обновятся, руководство получит уведомление.`,
        { parse_mode: "Markdown" },
      );
    } else {
      await bot.sendMessage(telegramId, session.dmIntro, { parse_mode: "Markdown" });
    }

    await askNextMetric(telegramId, state);
  }

  /** Анонс в общую группу с кнопкой «Дать отчёт» */
  async function announceInGroup(session: typeof SESSIONS[0], botUsername: string) {
    const keyboard = {
      inline_keyboard: [[
        {
          text: "💬 Дать отчёт",
          url: `https://t.me/${botUsername}?start=session_${session.type}`,
        },
      ]],
    };

    await bot.sendMessage(GROUP_CHAT_ID!, session.groupAnnouncement, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }

  /** Запустить сессию: анонс в группу (без ЛС) */
  async function broadcastSession(session: typeof SESSIONS[0]) {
    logger.info({ session: session.type }, "Broadcasting session");

    try {
      const botInfo = await bot.getMe();
      const botUsername = botInfo.username ?? "";
      await announceInGroup(session, botUsername);
    } catch (err) {
      logger.warn({ err }, "Failed to announce in group");
    }
  }

  /** Сводка в чат руководства */
  async function sendSummaryReport(session: typeof SESSIONS[0]) {
    const [employees, responses] = await Promise.all([
      getAllEmployees(),
      getTodaySessionResponses(session.type),
    ]);

    const label = SESSION_LABELS[session.type];
    const date = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Moscow",
    });

    const lines: string[] = [];
    lines.push(`📊 *${label}*`);
    lines.push(`📅 ${date}`);
    lines.push(`━━━━━━━━━━━━━━━━`);

    for (const metric of session.metrics) {
      const emoji = METRIC_EMOJIS[metric] ?? "📌";
      const metricResponses = responses.filter((r) => r.metric === metric);

      lines.push(`\n${emoji} *${metric}*`);

      if (metricResponses.length === 0) {
        lines.push(`  _— нет ответов_`);
      } else {
        for (const resp of metricResponses) {
          const name = resp.username ? `@${escapeMd(resp.username)}` : escapeMd(resp.name);
          lines.push(`  👤 ${name}: ${escapeMd(resp.answer)}`);
        }
      }
    }

    const respondedIds = new Set(responses.map((r) => r.telegramId));
    const missing = employees.filter((e) => !respondedIds.has(e.telegramId));

    lines.push(`\n━━━━━━━━━━━━━━━━`);
    if (missing.length > 0) {
      const missingNames = missing
        .map((e) => (e.username ? `@${escapeMd(e.username)}` : escapeMd(e.name)))
        .join(", ");
      lines.push(`⚠️ *Не заполнили:* ${missingNames}`);
    } else {
      lines.push(`✅ *Все заполнили отчёт!*`);
    }

    try {
      await bot.sendMessage(LEADERSHIP_CHAT_ID!, lines.join("\n"), {
        parse_mode: "Markdown",
      });
      logger.info({ session: session.type }, "Summary sent to leadership");
    } catch (err) {
      logger.error({ err }, "Failed to send summary");
    }
  }

  // ─── Команды ────────────────────────────────────────────────

  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private") return;

    const payload = match?.[1]?.trim();

    if (payload?.startsWith("session_")) {
      const sessionType = payload.replace("session_", "") as SessionType;
      const session = SESSIONS.find((s) => s.type === sessionType);
      if (session) {
        await startDmSession(chatId, session);
        return;
      }
    }

    const emp = await getEmployeeByTelegramId(chatId);
    const from = msg.from!;
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ");

    if (emp) {
      let text =
        `👋 Привет снова, *${emp.name}*!\n\n` +
        `Жди кнопку в общей группе или используй /report.\n\n` +
        `⏰ *Расписание (МСК, пн–пт):*\n` +
        `• 09:20 — Планы на день\n` +
        `• 13:00 — Промежуточный итог\n` +
        `• 16:00 — Дневной итог\n` +
        `• 18:00 — Финальный отчёт\n\n` +
        `✏️ /update — дополнить текущий отчёт`;
      if (isAdmin(chatId)) {
        text += `\n\n🔧 *Команды руководителя:*\n/add /remove /list /ask /summary /reset`;
      }
      await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    } else {
      await bot.sendMessage(
        chatId,
        `👋 Привет, *${name}*!\n\n` +
          `Я бот для ежедневных отчётов.\n\n` +
          `Твой Telegram ID:\n\`${chatId}\`\n\n` +
          `📤 Отправь этот ID руководителю — он добавит тебя в команду.`,
        { parse_mode: "Markdown" },
      );
    }
  });

  bot.onText(/\/report/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private") {
      await bot.sendMessage(chatId, "💬 Нажми кнопку «Дать отчёт» в общей группе.");
      return;
    }
    const emp = await getEmployeeByTelegramId(chatId);
    if (!emp) {
      await bot.sendMessage(
        chatId,
        `❌ Тебя нет в команде.\n\nТвой ID: \`${chatId}\`\nОтправь его руководителю.`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    const hourMsk = new Date().getUTCHours() + 3;
    let session = SESSIONS[0]!;
    if (hourMsk >= 18) session = SESSIONS[3]!;
    else if (hourMsk >= 16) session = SESSIONS[2]!;
    else if (hourMsk >= 13) session = SESSIONS[1]!;

    await startDmSession(chatId, session);
  });

  /** /update — менеджер дополняет/переписывает ответы текущей сессии */
  bot.onText(/\/update/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private") {
      await bot.sendMessage(chatId, "✏️ Используй эту команду в личке с ботом.");
      return;
    }
    const emp = await getEmployeeByTelegramId(chatId);
    if (!emp) {
      await bot.sendMessage(
        chatId,
        `❌ Тебя нет в команде.\n\nТвой ID: \`${chatId}\`\nОтправь его руководителю.`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    const keyboard = {
      inline_keyboard: SESSIONS.map((s) => [
        { text: SESSION_LABELS[s.type], callback_data: `update_${s.type}` },
      ]),
    };
    await bot.sendMessage(chatId, "✏️ Какой отчёт хочешь дополнить?", {
      reply_markup: keyboard,
    });
  });

  bot.onText(/\/add(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, "❌ У тебя нет прав для этой команды.");
      return;
    }
    const targetIdStr = match?.[1];
    if (!targetIdStr) {
      await bot.sendMessage(
        chatId,
        "📌 Использование: `/add <telegram_id>`\n\nМенеджер узнает свой ID, написав мне /start в личку.",
        { parse_mode: "Markdown" },
      );
      return;
    }
    const targetId = Number(targetIdStr);
    try {
      const info = await bot.getChat(targetId);
      const name =
        [info.first_name, info.last_name].filter(Boolean).join(" ") || `User ${targetId}`;
      await addEmployee(targetId, name, info.username);
      await bot.sendMessage(chatId, `✅ *${name}* добавлен в команду!`, {
        parse_mode: "Markdown",
      });
      await bot.sendMessage(
        targetId,
        `🎉 Тебя добавили в команду!\n\nТеперь в общей группе будет появляться кнопка «Дать отчёт» — нажимай её и отвечай здесь в личке.\n\n/report — ответить прямо сейчас\n/update — дополнить уже сданный отчёт`,
      );
    } catch {
      await bot.sendMessage(
        chatId,
        `❌ Не удалось добавить \`${targetId}\`.\nУбедись что менеджер написал мне /start.`,
        { parse_mode: "Markdown" },
      );
    }
  });

  bot.onText(/\/remove(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, "❌ У тебя нет прав для этой команды.");
      return;
    }
    const targetIdStr = match?.[1];
    if (!targetIdStr) {
      await bot.sendMessage(chatId, "📌 Использование: `/remove <telegram_id>`", {
        parse_mode: "Markdown",
      });
      return;
    }
    const removed = await removeEmployee(Number(targetIdStr));
    if (removed) {
      await bot.sendMessage(chatId, `✅ *${removed.name}* удалён из команды.`, {
        parse_mode: "Markdown",
      });
      try {
        await bot.sendMessage(Number(targetIdStr), "ℹ️ Тебя убрали из команды.");
      } catch {}
    } else {
      await bot.sendMessage(chatId, `❌ Менеджер с ID \`${targetIdStr}\` не найден.`, {
        parse_mode: "Markdown",
      });
    }
  });

  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, "❌ У тебя нет прав для этой команды.");
      return;
    }
    const employees = await getAllEmployees();
    if (employees.length === 0) {
      await bot.sendMessage(
        chatId,
        "📋 Команда пуста.\n\nДобавь первого: `/add <telegram_id>`",
        { parse_mode: "Markdown" },
      );
      return;
    }
    const lines = employees.map((e, i) => {
      const u = e.username ? ` (@${e.username})` : "";
      return `${i + 1}. *${e.name}*${u} — \`${e.telegramId}\``;
    });
    await bot.sendMessage(
      chatId,
      `👥 *Команда (${employees.length} чел.):*\n\n${lines.join("\n")}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.onText(/\/ask/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, "❌ У тебя нет прав для этой команды.");
      return;
    }
    const keyboard = {
      inline_keyboard: SESSIONS.map((s) => [
        { text: SESSION_LABELS[s.type], callback_data: `ask_${s.type}` },
      ]),
    };
    await bot.sendMessage(chatId, "📤 Какой отчёт запустить прямо сейчас?", {
      reply_markup: keyboard,
    });
  });

  /** /reset — сбросить ответы за сегодня */
  bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, "❌ У тебя нет прав для этой команды.");
      return;
    }
    const keyboard = {
      inline_keyboard: [
        ...SESSIONS.map((s) => [
          { text: `🗑 ${SESSION_LABELS[s.type]}`, callback_data: `reset_${s.type}` },
        ]),
        [{ text: "🗑 Все отчёты за сегодня", callback_data: "reset_all" }],
      ],
    };
    await bot.sendMessage(chatId, "⚠️ Какие ответы сбросить?", {
      reply_markup: keyboard,
    });
  });

  bot.onText(/\/testleadership/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, "❌ У тебя нет прав для этой команды.");
      return;
    }
    try {
      await bot.sendMessage(LEADERSHIP_CHAT_ID!, "🔔 Тестовое сообщение от бота. Если видишь это — чат настроен правильно.");
      await bot.sendMessage(chatId, `✅ Тестовое сообщение отправлено в чат \`${LEADERSHIP_CHAT_ID}\`\n\nЕсли в группе руководства его нет — значит ID неверный.`, { parse_mode: "Markdown" });
    } catch (err: any) {
      await bot.sendMessage(chatId, `❌ Ошибка отправки в чат \`${LEADERSHIP_CHAT_ID}\`:\n${err.message}`, { parse_mode: "Markdown" });
    }
  });

  bot.onText(/\/summary/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, "❌ У тебя нет прав для этой команды.");
      return;
    }
    const keyboard = {
      inline_keyboard: SESSIONS.map((s) => [
        { text: SESSION_LABELS[s.type], callback_data: `summary_${s.type}` },
      ]),
    };
    await bot.sendMessage(chatId, "📊 Сводку по какому отчёту показать?", {
      reply_markup: keyboard,
    });
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) {
      await bot.answerCallbackQuery(query.id);
      return;
    }

    const data = query.data ?? "";

    // ── Кнопки для менеджеров: выбор сессии для дополнения ──
    if (data.startsWith("update_")) {
      await bot.answerCallbackQuery(query.id);
      const type = data.replace("update_", "") as SessionType;
      const session = SESSIONS.find((s) => s.type === type);
      if (session) {
        await startDmSession(chatId, session, true);
      }
      return;
    }

    // ── Кнопки только для админов ──
    if (!isAdmin(chatId)) {
      await bot.answerCallbackQuery(query.id);
      return;
    }
    await bot.answerCallbackQuery(query.id);

    if (data.startsWith("ask_")) {
      const type = data.replace("ask_", "") as SessionType;
      const session = SESSIONS.find((s) => s.type === type);
      if (session) {
        await broadcastSession(session);
        await bot.sendMessage(chatId, `✅ Анонс *${SESSION_LABELS[type]}* отправлен в группу!`, {
          parse_mode: "Markdown",
        });
      }
    }

    if (data.startsWith("summary_")) {
      const type = data.replace("summary_", "") as SessionType;
      const session = SESSIONS.find((s) => s.type === type);
      if (session) {
        await sendSummaryReport(session);
      }
    }

    if (data.startsWith("reset_")) {
      const target = data.replace("reset_", "");
      let count = 0;
      let label = "";

      if (target === "all") {
        count = await clearTodayResponses();
        label = "все отчёты за сегодня";
      } else {
        const sessionType = target as SessionType;
        count = await clearTodayResponses(sessionType);
        label = SESSION_LABELS[sessionType] ?? target;
      }

      await bot.sendMessage(
        chatId,
        `🗑 *Сброс выполнен*\n\nУдалено ответов: ${count}\nСессия: ${label}`,
        { parse_mode: "Markdown" },
      );
      logger.info({ target, count }, "Responses reset by admin");
    }
  });

  // ─── Обработка ответов менеджеров в ЛС ─────────────────────

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private") return;
    if (!msg.text || msg.text.startsWith("/")) return;

    const state = pendingStates.get(chatId);
    if (!state) return;

    const emp = await getEmployeeByTelegramId(chatId);
    if (!emp) return;

    const metric = state.metrics[state.currentIndex]!;

    if (state.isUpdate) {
      // Обновляем ответ и уведомляем руководство
      await upsertMetricResponse(emp.id, chatId, state.sessionType, metric, msg.text);

      const empName = emp.username ? `@${escapeMd(emp.username)}` : escapeMd(emp.name);
      const sessionLabel = escapeMd(SESSION_LABELS[state.sessionType] ?? state.sessionType);
      const emoji = METRIC_EMOJIS[metric] ?? "📌";

      try {
        await bot.sendMessage(
          LEADERSHIP_CHAT_ID!,
          `📝 *Дополнение отчёта*\n\n👤 ${empName}\n📊 ${sessionLabel}\n${emoji} *${escapeMd(metric)}:* ${escapeMd(msg.text)}`,
          { parse_mode: "Markdown" },
        );
      } catch (err) {
        logger.error({ err }, "Failed to send update notification to leadership");
      }
    } else {
      await saveMetricResponse(emp.id, chatId, state.sessionType, metric, msg.text);
    }

    state.currentIndex++;

    if (state.currentIndex < state.metrics.length) {
      await askNextMetric(chatId, state);
    } else {
      pendingStates.delete(chatId);
      const doneMsg = state.isUpdate
        ? `✅ *Данные обновлены!*\n\nРуководство получило уведомление.`
        : `🎉 *Отчёт принят!*\n\nОтлично сработал, так держать! 💪`;
      await bot.sendMessage(chatId, doneMsg, { parse_mode: "Markdown" });
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Polling error");
  });

  // ─── Расписание cron ────────────────────────────────────────

  for (const session of SESSIONS) {
    const utcCron = mskCronToUtc(session.cronMsk);

    cron.schedule(utcCron, async () => {
      logger.info({ session: session.type }, "Cron: broadcasting session");
      await broadcastSession(session);
    });

    const parts = utcCron.split(" ");
    const baseMin = parseInt(parts[0]!);
    const baseHour = parseInt(parts[1]!);
    const totalMin = baseMin + session.summaryDelayMin;
    const summaryMin = totalMin % 60;
    const summaryHour = (baseHour + Math.floor(totalMin / 60)) % 24;
    const summaryCron = `${summaryMin} ${summaryHour} ${parts.slice(2).join(" ")}`;

    cron.schedule(summaryCron, async () => {
      logger.info({ session: session.type }, "Cron: sending summary");
      await sendSummaryReport(session);
    });

    logger.info({ session: session.type, utcCron, summaryCron }, "Cron scheduled");
  }

  return bot;
}
