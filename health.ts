export type SessionType = "morning" | "midday" | "afternoon" | "evening";

export interface Session {
  type: SessionType;
  cronMsk: string;
  /** Сообщение в общей группе */
  groupAnnouncement: string;
  /** Вводное сообщение в личке менеджеру */
  dmIntro: string;
  /** Список метрик (задаются по очереди) */
  metrics: string[];
  /** Через сколько минут после старта отправлять сводку */
  summaryDelayMin: number;
}

export const SESSIONS: Session[] = [
  {
    type: "morning",
    cronMsk: "20 9 * * 1-5",
    groupAnnouncement:
      "☀️ *Доброе утро, команда!*\n\n📋 Время утреннего отчёта — *Что мы имеем на день?*\n\nОткрывай личку с ботом и заполняй — у тебя 10 минут 💪",
    dmIntro: "☀️ *Что мы имеем на день?*\n\nОтвечай по очереди на вопросы 👇",
    metrics: ["Вбросы", "Предлоги", "Обратки"],
    summaryDelayMin: 10,
  },
  {
    type: "midday",
    cronMsk: "0 13 * * 1-5",
    groupAnnouncement:
      "🕐 *Обед!*\n\n📋 Промежуточный отчёт — *Что успел сделать?*\n\nОткрывай личку с ботом — у тебя 10 минут ⚡",
    dmIntro: "🕐 *Что успел сделать?*\n\nОтвечай по очереди на вопросы 👇",
    metrics: ["Вбросы", "Предлоги", "Согласы", "Обратки"],
    summaryDelayMin: 10,
  },
  {
    type: "afternoon",
    cronMsk: "0 16 * * 1-5",
    groupAnnouncement:
      "💪 *16:00 — время отчёта!*\n\n📋 *Что успел сделать?*\n\nОткрывай личку с ботом — у тебя 10 минут 🔥",
    dmIntro: "💪 *Что успел сделать?*\n\nОтвечай по очереди на вопросы 👇",
    metrics: ["Вбросы", "Предлоги", "Согласы", "Обратки"],
    summaryDelayMin: 10,
  },
  {
    type: "evening",
    cronMsk: "0 18 * * 1-5",
    groupAnnouncement:
      "🏆 *Финиш близко!*\n\n📋 Последний отчёт дня — давай перепроверим\n\nОткрывай личку с ботом — у тебя 10 минут 🎯",
    dmIntro:
      "🔥 *Ну не поверю что ты не справился, давай ещё раз перепроверим!*\n\nОтвечай по очереди на вопросы 👇",
    metrics: ["Вбросы", "Предлоги", "Согласы", "Обратки"],
    summaryDelayMin: 10,
  },
];

export const SESSION_LABELS: Record<SessionType, string> = {
  morning: "☀️ Утро — Что мы имеем на день?",
  midday: "🕐 Обед — Что успел сделать?",
  afternoon: "💪 16:00 — Что успел сделать?",
  evening: "🏆 Итог дня",
};

export const METRIC_EMOJIS: Record<string, string> = {
  Вбросы: "📤",
  Предлоги: "📝",
  Согласы: "✅",
  Обратки: "🔄",
};

export function mskCronToUtc(mskCron: string): string {
  const parts = mskCron.split(" ");
  const mskMinute = parseInt(parts[0]!);
  const mskHour = parseInt(parts[1]!);
  const utcHour = ((mskHour - 3) + 24) % 24;
  return `${mskMinute} ${utcHour} ${parts.slice(2).join(" ")}`;
}
