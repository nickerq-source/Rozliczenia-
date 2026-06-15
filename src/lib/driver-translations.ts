import type { DayType } from "./types";

export type DriverLanguage = "pl" | "ru";

export const DRIVER_LANGUAGE_STORAGE_KEY = "papitrans_driver_language";

export function normalizeDriverLanguage(value: unknown): DriverLanguage {
  return value === "ru" ? "ru" : "pl";
}

export const DRIVER_TRANSLATIONS = {
  pl: {
    language: {
      label: "Język",
      polish: "Polski",
      russian: "Русский",
      saving: "Zapisywanie języka…",
      error: "Nie udało się zapisać języka.",
    },
    nav: {
      payout: "Wypłata",
      fuel: "Tankowanie",
      messages: "Wiadomości",
      legend: "Legenda",
      fuelShort: "Tank.",
      messagesShort: "Wiad.",
      legendShort: "Zasady",
    },
    header: {
      logout: "Wyloguj",
      title: {
        payout: "Wypłata",
        fuel: "Tankowanie",
        messages: "Wiadomości",
        legend: "Legenda stawek i zasad",
      },
      description: {
        payout: "Sprawdź dni pracy, kółka, zlecenia i zgłoś poprawki.",
        fuel: "Dodaj tankowanie, zdjęcie licznika i paragon.",
        messages: "Powiadomienia, notatki i kontakt z biurem.",
        legend: "Stawki, premie i zasady naliczania wypłaty.",
      },
    },
    payout: {
      verifyHint: "Zgadza się? Zaznacz",
      issueHint: "Coś nie gra? Kliknij",
      issueHintTail: "i podaj poprawną liczbę kółek.",
      loadError: "Nie udało się pobrać danych.",
      retry: "Spróbuj ponownie",
      loading: "Ładowanie…",
      paid: "Wypłacone",
      unpaid: "Niewypłacone",
      earnedMinusDeductions: "zarobek {earned} − obciążenia {deductions}",
      workSummary: "{days} dni pracy · {loops} kółek · soboty {saturdays}/4",
      premium: "premia",
      unpaidWeekdayLeave: "Wolne bezpłatne Pon–Pt:",
      extrasBlocked: "— premia i dodatki niedzielne zablokowane",
      workingDays: "Pracujące:",
      freeDays: "Wolne:",
      vacation: "Urlop:",
      sickLeave: "L4:",
      downloadPdf: "Pobierz PDF wypłaty",
      breakdownTitle: "Rozliczenie wypłaty",
      loopsAndExtras: "Zarobek z kółek + dodatki",
      saturdayPremium: "Premia sobotnia",
      blockedInfo:
        "Premia sobotnia 200 zł i dodatki niedzielne 250 zł nie są doliczone, bo w tym miesiącu są co najmniej 2 dni wolnego bezpłatnego od poniedziałku do piątku.",
      deductions: "Obciążenia",
      noDeductions: "Brak obciążeń w tym miesiącu.",
      toPay: "Do wypłaty",
      dayToCheck: "dzień do sprawdzenia",
      daysToCheck: "dni do sprawdzenia",
    },
    day: {
      loops: "kółek",
      ordersShort: "zlec.",
      sundayBonus: "+niedziela",
      training: "szkolenie",
      confirmFree: "Tak, {dayType} się zgadza",
      confirmWork: "Wszystko się zgadza",
      reportWorked: "Pracowałem tego dnia — zgłoś",
      reportError: "Zgłoś błąd",
      confirmed: "Potwierdzone przez Ciebie",
      waiting: "czeka",
      fixed: "ok",
      rejected: "Twoje zgłoszenie zostało odrzucone przez biuro.",
      reported: "Zgłoszono: {old} → {next} kółek",
      wasFree: "Ten dzień jest oznaczony jako {dayType}. Jeśli pracowałeś — podaj liczbę kółek.",
      shouldBeLoops: "Powinno być kółek:",
      workedLoops: "Pracowałem — kółek:",
      commentPlaceholder: "Komentarz (opcjonalnie)…",
      sendReport: "Wyślij zgłoszenie",
      cancel: "Anuluj",
      onlyOrders: "tylko zlecenia",
    },
    dayType: {
      pracujacy: "pracujący",
      praca_zlecenia: "praca + zlecenia",
      zlecenia: "zlecenia",
      wolne: "wolne",
      urlop: "urlop",
      chorobowe: "chorobowe (L4)",
    } satisfies Record<DayType, string>,
    fuel: {
      title: "Tankowanie",
      intro: "Wpisz litry i cenę albo zrób zdjęcie paragonu — reszta sama trafi do rozliczenia.",
      manual: "Wpisz ręcznie",
      photo: "Ze zdjęcia",
      reading: "Odczytuję…",
      aiManual: "AI niedostępne — wpisz dane",
      aiRead: "Odczytano ze zdjęcia — sprawdź",
      readError: "Nie udało się odczytać zdjęcia. Wpisz dane ręcznie.",
      amountRequired: "Podaj kwotę tankowania (zł).",
      saveError: "Nie udało się zapisać tankowania.",
      connectionError: "Błąd połączenia. Spróbuj ponownie.",
      liters: "Litry",
      pricePerLiter: "Cena za litr (zł)",
      grossAmount: "Kwota brutto (razem)",
      date: "Data",
      station: "Stacja (opcjonalnie)",
      stationPlaceholder: "np. Orlen",
      cancel: "Anuluj",
      save: "Zapisz tankowanie",
      yourFuel: "Twoje tankowania",
      closed: "zamknięty",
      sure: "Na pewno?",
      delete: "Usuń",
      no: "Nie",
      deleteTitle: "Usuń tankowanie",
    },
    messages: {
      title: "Wiadomości",
      intro: "Wiadomości od szefa i Twoje odpowiedzi.",
      placeholder: "Napisz wiadomość do szefa…",
      send: "Wyślij",
      loading: "Ładowanie…",
      empty: "Brak wiadomości.",
      you: "Ty",
    },
    notifications: {
      title: "Powiadomienia",
      collapse: "Zwiń",
      expand: "Rozwiń",
      pushOn: "Push włączony",
      pushOff: "Push wyłączony",
      pushLabel: "Powiadomienia na telefon",
      turnOn: "Włącz powiadomienia",
      turnOff: "Wyłącz powiadomienia",
      enableError: "Nie udało się włączyć powiadomień — sprawdź zgodę w telefonie.",
      loading: "Ładowanie…",
      empty: "Brak powiadomień.",
      now: "przed chwilą",
      minutesAgo: "{count} min temu",
      hoursAgo: "{count} godz. temu",
      yesterday: "wczoraj",
      daysAgo: "{count} dni temu",
    },
    legend: [
      "💰 LEGENDA WYPŁATY",
      "Kółko = 100 zł.",
      "Zlecenie = 50–100 zł albo cena indywidualna wpisana przez biuro.",
      "Premia sobotnia = +200 zł za 4 przepracowane soboty w miesiącu.\nUrlop i L4 nie przerywają ciągłości pracy, więc premia nadal się należy.",
      "Sobota + niedziela = normalna kasa z kółek i zleceń + dodatkowe 250 zł.",
      "Od lipca:\nJeżeli kierowca ma 2 dni wolnego bezpłatnego w dni robocze od poniedziałku do piątku, traci dodatek 250 zł za sobotę + niedzielę.",
      "Soboty nie liczą się do limitu wolnego bezpłatnego.\nDwie soboty w miesiącu są obowiązkowe.\nPozostałe soboty nie są traktowane jako wolne bezpłatne.",
      "Jeżeli z przyczyn niezależnych od pracodawcy kierowca otrzyma wolne, ponieważ Żabka nie zapewni wystarczającej ilości pracy, taki dzień nie jest liczony jako wolne bezpłatne. Nie jest to wolne z winy kierowcy i nie wpływa na utratę dodatków ani premii.",
    ],
  },
  ru: {
    language: {
      label: "Язык",
      polish: "Polski",
      russian: "Русский",
      saving: "Сохраняю язык…",
      error: "Не удалось сохранить язык.",
    },
    nav: {
      payout: "Выплата",
      fuel: "Заправка",
      messages: "Сообщения",
      legend: "Правила",
      fuelShort: "Топл.",
      messagesShort: "Сооб.",
      legendShort: "Прав.",
    },
    header: {
      logout: "Выйти",
      title: {
        payout: "Выплата",
        fuel: "Заправка",
        messages: "Сообщения",
        legend: "Ставки и правила",
      },
      description: {
        payout: "Проверь рабочие дни, маршруты, заявки и отправь исправления.",
        fuel: "Добавь заправку, фото счетчика и чек.",
        messages: "Уведомления, заметки и связь с офисом.",
        legend: "Ставки, премии и правила расчета выплаты.",
      },
    },
    payout: {
      verifyHint: "Все верно? Нажми",
      issueHint: "Что-то не так? Нажми",
      issueHintTail: "и укажи правильное количество маршрутов.",
      loadError: "Не удалось загрузить данные.",
      retry: "Попробовать снова",
      loading: "Загрузка…",
      paid: "Выплачено",
      unpaid: "Не выплачено",
      earnedMinusDeductions: "заработок {earned} − удержания {deductions}",
      workSummary: "{days} рабочих дней · {loops} маршрутов · субботы {saturdays}/4",
      premium: "премия",
      unpaidWeekdayLeave: "Неоплач. выходные Пн–Пт:",
      extrasBlocked: "— премия и воскресные доплаты заблокированы",
      workingDays: "Рабочие:",
      freeDays: "Выходные:",
      vacation: "Отпуск:",
      sickLeave: "L4:",
      downloadPdf: "Скачать PDF выплаты",
      breakdownTitle: "Расчет выплаты",
      loopsAndExtras: "Оплата маршрутов + доплаты",
      saturdayPremium: "Субботняя премия",
      blockedInfo:
        "Субботняя премия 200 zł и воскресные доплаты 250 zł не начислены, потому что в этом месяце есть минимум 2 дня неоплачиваемого выходного с понедельника по пятницу.",
      deductions: "Удержания",
      noDeductions: "В этом месяце нет удержаний.",
      toPay: "К выплате",
      dayToCheck: "день для проверки",
      daysToCheck: "дней для проверки",
    },
    day: {
      loops: "маршр.",
      ordersShort: "заяв.",
      sundayBonus: "+воскресенье",
      training: "обучение",
      confirmFree: "Да, {dayType} верно",
      confirmWork: "Все верно",
      reportWorked: "Я работал в этот день — сообщить",
      reportError: "Сообщить ошибку",
      confirmed: "Подтверждено тобой",
      waiting: "ожидает",
      fixed: "ок",
      rejected: "Твоя заявка была отклонена офисом.",
      reported: "Сообщено: {old} → {next} маршрутов",
      wasFree: "Этот день отмечен как {dayType}. Если ты работал — укажи количество маршрутов.",
      shouldBeLoops: "Должно быть маршрутов:",
      workedLoops: "Я работал — маршрутов:",
      commentPlaceholder: "Комментарий (необязательно)…",
      sendReport: "Отправить заявку",
      cancel: "Отмена",
      onlyOrders: "только заявки",
    },
    dayType: {
      pracujacy: "рабочий",
      praca_zlecenia: "работа + заявки",
      zlecenia: "заявки",
      wolne: "выходной",
      urlop: "отпуск",
      chorobowe: "больничный (L4)",
    } satisfies Record<DayType, string>,
    fuel: {
      title: "Заправка",
      intro: "Введи литры и цену или сделай фото чека — данные попадут в расчет.",
      manual: "Ввести вручную",
      photo: "По фото",
      reading: "Считываю…",
      aiManual: "AI недоступен — введи данные",
      aiRead: "Считано с фото — проверь",
      readError: "Не удалось считать фото. Введи данные вручную.",
      amountRequired: "Укажи сумму заправки (zł).",
      saveError: "Не удалось сохранить заправку.",
      connectionError: "Ошибка соединения. Попробуй снова.",
      liters: "Литры",
      pricePerLiter: "Цена за литр (zł)",
      grossAmount: "Сумма брутто (всего)",
      date: "Дата",
      station: "Станция (необязательно)",
      stationPlaceholder: "напр. Orlen",
      cancel: "Отмена",
      save: "Сохранить заправку",
      yourFuel: "Твои заправки",
      closed: "закрыт",
      sure: "Точно?",
      delete: "Удалить",
      no: "Нет",
      deleteTitle: "Удалить заправку",
    },
    messages: {
      title: "Сообщения",
      intro: "Сообщения от офиса и твои ответы.",
      placeholder: "Напиши сообщение в офис…",
      send: "Отправить",
      loading: "Загрузка…",
      empty: "Нет сообщений.",
      you: "Ты",
    },
    notifications: {
      title: "Уведомления",
      collapse: "Свернуть",
      expand: "Развернуть",
      pushOn: "Push включен",
      pushOff: "Push выключен",
      pushLabel: "Уведомления на телефон",
      turnOn: "Включить уведомления",
      turnOff: "Выключить уведомления",
      enableError: "Не удалось включить уведомления — проверь разрешение на телефоне.",
      loading: "Загрузка…",
      empty: "Нет уведомлений.",
      now: "только что",
      minutesAgo: "{count} мин назад",
      hoursAgo: "{count} ч назад",
      yesterday: "вчера",
      daysAgo: "{count} дн. назад",
    },
    legend: [
      "💰 ЛЕГЕНДА ВЫПЛАТ",
      "Маршрут = 100 zł.",
      "Заявка = 50–100 zł или индивидуальная цена, указанная офисом.",
      "Субботняя премия = +200 zł за 4 отработанные субботы в месяце.\nОтпуск и больничный L4 не прерывают непрерывность работы, поэтому премия сохраняется.",
      "Суббота + воскресенье = обычная оплата за маршруты и заявки + дополнительная премия 250 zł.",
      "С июля:\nЕсли у водителя есть 2 дня неоплачиваемого выходного в рабочие дни с понедельника по пятницу, он теряет дополнительную премию 250 zł за субботу + воскресенье.",
      "Субботы не считаются в лимит неоплачиваемых выходных.\nДве субботы в месяце являются обязательными рабочими днями.\nОстальные субботы не считаются неоплачиваемым выходным.",
      "Если по причинам, не зависящим от работодателя, водитель получает выходной, потому что Żabka не предоставила достаточное количество работы, такой день не считается неоплачиваемым выходным. Это не выходной по вине водителя и он не влияет на потерю премий или дополнительных выплат.",
    ],
  },
} as const;

export function driverTexts(lang: DriverLanguage) {
  return DRIVER_TRANSLATIONS[normalizeDriverLanguage(lang)] ?? DRIVER_TRANSLATIONS.pl;
}

export function replaceVars(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text
  );
}

export function driverMonthName(lang: DriverLanguage, month: number): string {
  const pl = ["", "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
  const ru = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  return normalizeDriverLanguage(lang) === "ru" ? ru[month] ?? pl[month] : pl[month];
}

export function driverWeekdayShort(lang: DriverLanguage, iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const pl = ["Nie", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];
  const ru = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return normalizeDriverLanguage(lang) === "ru" ? ru[d.getDay()] : pl[d.getDay()];
}

export function driverNotificationDescription(lang: DriverLanguage, description: string): string {
  if (normalizeDriverLanguage(lang) !== "ru") return description;

  let text = description;
  text = text.replace(
    /^(.+?) napisał do kierowcy: (.+)$/u,
    "$1 написал водителю: $2"
  );
  text = text.replace(
    /^(.+?) dodał obciążenie kierowcy ([^:]+): (.+)$/u,
    "$1 добавил удержание водителю $2: $3"
  );
  text = text.replace(
    /^(.+?) usunął obciążenie kierowcy: (.+)$/u,
    "$1 удалил удержание водителя: $2"
  );
  text = text.replace(
    /^(.+?) oznaczył wypłatę kierowcy (.+?) jako wypłaconą$/u,
    "$1 отметил выплату водителя $2 как выплаченную"
  );
  text = text.replace(
    /^(.+?) cofnął oznaczenie wypłaty kierowcy (.+)$/u,
    "$1 отменил отметку выплаты водителя $2"
  );
  text = text.replace(
    /^(.+?) zaktualizował wypłatę kierowcy: (.+)$/u,
    "$1 обновил выплату водителя: $2"
  );

  const monthPairs: Array<[string, string]> = [
    ["Czerwiec", "Июнь"],
    ["Lipiec", "Июль"],
    ["Sierpień", "Август"],
    ["Wrzesień", "Сентябрь"],
    ["Październik", "Октябрь"],
    ["Listopad", "Ноябрь"],
    ["Grudzień", "Декабрь"],
  ];
  for (const [pl, ru] of monthPairs) {
    text = text.replaceAll(pl, ru);
  }
  return text;
}
