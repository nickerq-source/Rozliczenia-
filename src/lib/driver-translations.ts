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
        payout: "Sprawdź dni pracy, kółka, dodatkowe zlecenia i zgłoś poprawki.",
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
      loopsAndExtras: "Wynagrodzenie za kółka + dodatki",
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
      takePhoto: "Zrób zdjęcie",
      chooseGallery: "Wybierz z galerii",
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
      newNote: "Nowa notatka",
      unread: "Nieprzeczytane",
      confirmRead: "Potwierdzam, że przeczytałem",
      readConfirmed: "Przeczytane",
      readError: "Nie udało się potwierdzić przeczytania.",
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
    legend: {
      title: "💰 LEGENDA WYPŁATY KIEROWCY",
      intro:
        "Wypłata kierowcy jest liczona na podstawie kółek, dodatkowych zleceń, urlopów oraz premii i dodatków za obecność, soboty i weekendy.",
      sections: [
        {
          title: "KÓŁKO",
          important: "Każde zaliczone kółko = 100 zł.",
        },
        {
          title: "DODATKOWE ZLECENIE",
          important: "Dodatkowe zlecenie = 50–100 zł albo cena indywidualna wpisana przez biuro.",
        },
        {
          title: "URLOP",
          important: "Urlop to dzień urlopowy płatny 250 zł.",
          points: [
            "Urlop nie przerywa ciągłości pracy i nie powoduje utraty premii ani dodatków.",
            "Kierowca ma 14 dni urlopowych na cały rok.",
            "Do końca grudnia kierowcy pozostało 8 dni urlopowych.",
          ],
          examples: [
            "Jeżeli kierowca bierze urlop w środę, ten dzień jest płatny 250 zł i nie przerywa ciągłości pracy.",
          ],
        },
        {
          title: "WOLNE BEZPŁATNE",
          important: "Wolne oznacza dzień wolny bezpłatny.",
          points: [
            "1 dzień wolnego bezpłatnego w miesiącu nie przerywa ciągłości pracy i nie zabiera premii ani dodatków.",
            "Dopiero 2 dni wolnego bezpłatnego w tym samym miesiącu, w dni robocze od poniedziałku do piątku, przerywają ciągłość pracy.",
            "Jeżeli kierowca ma 2 dni wolnego bezpłatnego w miesiącu, traci dodatek 250 zł za sobotę + niedzielę.",
          ],
          examples: [
            "Kierowca bierze wolne bezpłatne w środę. To jedyny taki dzień w miesiącu. Ciągłość pracy nie jest przerwana i dodatki nadal przysługują.",
            "Kierowca bierze wolne bezpłatne w środę i piątek. To 2 dni wolnego bezpłatnego w dni robocze w tym samym miesiącu. Ciągłość pracy zostaje przerwana i kierowca traci dodatek 250 zł za sobotę + niedzielę.",
          ],
        },
        {
          title: "PREMIA SOBOTNIA",
          important: "Premia sobotnia = 200 zł.",
          points: [
            "Premia przysługuje za 4 przepracowane soboty w miesiącu.",
            "Warunek: kierowca musi zachować ciągłość pracy.",
            "Urlop nie przerywa ciągłości pracy.",
            "1 dzień wolnego bezpłatnego w miesiącu też nie przerywa ciągłości pracy.",
            "2 dni wolnego bezpłatnego w dni robocze od poniedziałku do piątku przerywają ciągłość pracy.",
          ],
        },
        {
          title: "DODATEK ZA SOBOTĘ + NIEDZIELĘ",
          important:
            "Jeżeli kierowca pracuje w sobotę i niedzielę, otrzymuje normalne wynagrodzenie za kółka i dodatkowe zlecenia oraz dodatkowo 250 zł premii.",
          points: [
            "Czyli: sobota + niedziela = wynagrodzenie za kółka + wynagrodzenie za zlecenia + dodatek 250 zł.",
          ],
          highlight: true,
        },
        {
          title: "WARUNEK DODATKU 250 ZŁ OD LIPCA",
          important:
            "Od lipca dodatek 250 zł za sobotę + niedzielę zależy od liczby dni wolnego bezpłatnego w miesiącu.",
          points: [
            "Do limitu liczą się tylko dni robocze od poniedziałku do piątku.",
            "1 dzień wolnego bezpłatnego w miesiącu nie zabiera dodatku 250 zł.",
            "2 dni wolnego bezpłatnego w miesiącu zabierają dodatek 250 zł za sobotę + niedzielę.",
          ],
          highlight: true,
        },
        {
          title: "SOBOTY A WOLNE BEZPŁATNE",
          important: "Soboty nie liczą się do limitu wolnego bezpłatnego.",
          points: [
            "Do limitu liczymy tylko dni robocze od poniedziałku do piątku.",
            "Dwie soboty w miesiącu są obowiązkowe.",
            "Pozostałe soboty nie są traktowane jako wolne bezpłatne.",
          ],
        },
        {
          title: "WOLNE Z POWODU BRAKU PRACY Z ŻABKI",
          important:
            "Jeżeli kierowca otrzyma wolne, bo Żabka nie zapewni wystarczającej ilości pracy, taki dzień nie jest liczony jako wolne bezpłatne.",
          points: [
            "Nie jest to wolne z winy kierowcy i nie wpływa na utratę premii ani dodatków.",
          ],
        },
      ],
      summaryTitle: "PODSUMOWANIE",
      summary: [
        "Kółko = 100 zł.",
        "Dodatkowe zlecenie = 50–100 zł albo cena indywidualna.",
        "Urlop = dzień płatny 250 zł.",
        "Wolne = dzień wolny bezpłatny.",
        "1 dzień wolnego bezpłatnego w miesiącu nie przerywa ciągłości pracy.",
        "2 dni wolnego bezpłatnego w dni robocze przerywają ciągłość pracy i zabierają dodatek 250 zł za sobotę + niedzielę.",
        "Premia sobotnia = 200 zł za 4 przepracowane soboty.",
        "Sobota + niedziela = normalne wynagrodzenie + dodatek 250 zł.",
        "Soboty nie liczą się jako wolne bezpłatne.",
        "Wolne z powodu braku pracy z Żabki nie liczy się jako wolne bezpłatne.",
      ],
    },
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
        payout: "Проверь рабочие дни, рейсы, дополнительные заказы и отправь исправления.",
        fuel: "Добавь заправку, фото счетчика и чек.",
        messages: "Уведомления, заметки и связь с офисом.",
        legend: "Ставки, премии и правила расчета выплаты.",
      },
    },
    payout: {
      verifyHint: "Все верно? Нажми",
      issueHint: "Что-то не так? Нажми",
      issueHintTail: "и укажи правильное количество рейсов.",
      loadError: "Не удалось загрузить данные.",
      retry: "Попробовать снова",
      loading: "Загрузка…",
      paid: "Выплачено",
      unpaid: "Не выплачено",
      earnedMinusDeductions: "заработок {earned} − удержания {deductions}",
      workSummary: "{days} рабочих дней · {loops} рейсов · субботы {saturdays}/4",
      premium: "премия",
      unpaidWeekdayLeave: "Неоплач. выходные Пн–Пт:",
      extrasBlocked: "— премия и воскресные доплаты заблокированы",
      workingDays: "Рабочие:",
      freeDays: "Выходные:",
      vacation: "Отпуск:",
      sickLeave: "L4:",
      downloadPdf: "Скачать PDF выплаты",
      breakdownTitle: "Расчет выплаты",
      loopsAndExtras: "Оплата за рейсы + дополнительные выплаты",
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
      loops: "рейсов",
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
      reported: "Сообщено: {old} → {next} рейсов",
      wasFree: "Этот день отмечен как {dayType}. Если ты работал — укажи количество рейсов.",
      shouldBeLoops: "Должно быть рейсов:",
      workedLoops: "Я работал — рейсов:",
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
      takePhoto: "Сделать фото",
      chooseGallery: "Выбрать из галереи",
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
      newNote: "Новая заметка",
      unread: "Не прочитано",
      confirmRead: "Подтверждаю, что прочитал",
      readConfirmed: "Прочитано",
      readError: "Не удалось подтвердить прочтение.",
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
    legend: {
      title: "💰 ЛЕГЕНДА ВЫПЛАТ ВОДИТЕЛЯ",
      intro:
        "Выплата водителя рассчитывается на основе выполненных рейсов, дополнительных заказов, отпускных дней, премий и дополнительных выплат за посещаемость, работу по субботам и работу в выходные.",
      sections: [
        {
          title: "РЕЙС",
          important: "Каждый засчитанный рейс = 100 zł.",
        },
        {
          title: "ДОПОЛНИТЕЛЬНЫЙ ЗАКАЗ",
          important: "Дополнительный заказ = 50–100 zł или индивидуальная цена, указанная офисом.",
        },
        {
          title: "ОТПУСК",
          important: "Отпуск — это оплачиваемый отпускной день в размере 250 zł.",
          points: [
            "Отпуск не нарушает непрерывность работы и не приводит к потере премий или дополнительных выплат.",
            "У водителя есть 14 отпускных дней на весь год.",
            "До конца декабря у водителя осталось 8 отпускных дней.",
          ],
          examples: [
            "Если водитель берет отпуск в среду, этот день оплачивается 250 zł и не нарушает непрерывность работы.",
          ],
        },
        {
          title: "НЕОПЛАЧИВАЕМЫЙ ВЫХОДНОЙ",
          important: "Неоплачиваемый выходной означает день без оплаты.",
          points: [
            "1 день неоплачиваемого выходного в месяце не нарушает непрерывность работы и не лишает водителя премий или дополнительных выплат.",
            "Только 2 дня неоплачиваемого выходного в одном месяце, в рабочие дни с понедельника по пятницу, нарушают непрерывность работы.",
            "Если у водителя есть 2 дня неоплачиваемого выходного в месяце, он теряет дополнительную выплату 250 zł за работу в субботу и воскресенье.",
          ],
          examples: [
            "Водитель берет неоплачиваемый выходной в среду. Это единственный такой день в месяце. Непрерывность работы не нарушается, премии и дополнительные выплаты сохраняются.",
            "Водитель берет неоплачиваемый выходной в среду и пятницу. Это 2 дня неоплачиваемого выходного в рабочие дни в одном месяце. Непрерывность работы нарушается, и водитель теряет дополнительную выплату 250 zł за работу в субботу и воскресенье.",
          ],
        },
        {
          title: "СУББОТНЯЯ ПРЕМИЯ",
          important: "Субботняя премия = 200 zł.",
          points: [
            "Премия начисляется за 4 отработанные субботы в месяце.",
            "Условие: водитель должен сохранить непрерывность работы.",
            "Отпуск не нарушает непрерывность работы.",
            "1 день неоплачиваемого выходного в месяце также не нарушает непрерывность работы.",
            "2 дня неоплачиваемого выходного в рабочие дни с понедельника по пятницу нарушают непрерывность работы.",
          ],
        },
        {
          title: "ДОПОЛНИТЕЛЬНАЯ ВЫПЛАТА ЗА СУББОТУ + ВОСКРЕСЕНЬЕ",
          important:
            "Если водитель работает в субботу и воскресенье, он получает обычную оплату за рейсы и дополнительные заказы, а также дополнительную выплату 250 zł.",
          points: [
            "То есть: суббота + воскресенье = оплата за рейсы + оплата за заказы + дополнительная выплата 250 zł.",
          ],
          highlight: true,
        },
        {
          title: "УСЛОВИЕ ДЛЯ ВЫПЛАТЫ 250 ZŁ С ИЮЛЯ",
          important:
            "С июля дополнительная выплата 250 zł за субботу + воскресенье зависит от количества неоплачиваемых выходных в месяце.",
          points: [
            "В лимит считаются только рабочие дни с понедельника по пятницу.",
            "1 день неоплачиваемого выходного в месяце не лишает водителя выплаты 250 zł.",
            "2 дня неоплачиваемого выходного в месяце лишают водителя выплаты 250 zł за субботу + воскресенье.",
          ],
          highlight: true,
        },
        {
          title: "СУББОТЫ И НЕОПЛАЧИВАЕМЫЕ ВЫХОДНЫЕ",
          important: "Субботы не считаются в лимит неоплачиваемых выходных.",
          points: [
            "В лимит считаются только рабочие дни с понедельника по пятницу.",
            "Две субботы в месяце являются обязательными рабочими днями.",
            "Остальные субботы не считаются неоплачиваемым выходным.",
          ],
        },
        {
          title: "ВЫХОДНОЙ ИЗ-ЗА ОТСУТСТВИЯ РАБОТЫ ОТ ŻABKA",
          important:
            "Если водитель получает выходной, потому что Żabka не предоставила достаточное количество работы, такой день не считается неоплачиваемым выходным.",
          points: [
            "Это не выходной по вине водителя и он не влияет на потерю премий или дополнительных выплат.",
          ],
        },
      ],
      summaryTitle: "КРАТКОЕ РЕЗЮМЕ",
      summary: [
        "Рейс = 100 zł.",
        "Дополнительный заказ = 50–100 zł или индивидуальная цена.",
        "Отпуск = оплачиваемый день 250 zł.",
        "Неоплачиваемый выходной = день без оплаты.",
        "1 день неоплачиваемого выходного в месяце не нарушает непрерывность работы.",
        "2 дня неоплачиваемого выходного в рабочие дни нарушают непрерывность работы и лишают водителя выплаты 250 zł за субботу + воскресенье.",
        "Субботняя премия = 200 zł за 4 отработанные субботы.",
        "Суббота + воскресенье = обычная оплата + дополнительная выплата 250 zł.",
        "Субботы не считаются неоплачиваемыми выходными.",
        "Выходной из-за отсутствия работы от Żabka не считается неоплачиваемым выходным.",
      ],
    },
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
  text = text.replace(
    /^Dziś: (.+)$/u,
    "Сегодня: $1"
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
