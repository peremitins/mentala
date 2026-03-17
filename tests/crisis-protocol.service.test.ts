import { describe, expect, it } from 'vitest';
import {
  buildCrisisGuidance,
  mergeDeveloperPrompts,
  resolveCountryCodeFromLocale,
  resolveCrisisLevel,
} from '../server/application/chat/crisis-protocol.service';

describe('crisis protocol service', () => {
  it('детектирует высокий риск по прямым формулировкам', () => {
    const level = resolveCrisisLevel([
      { role: 'user', content: 'I want to kill myself' },
    ]);

    expect(level).toBe('crisis_high');
  });

  it('детектирует высокий риск по коротким русским фразам без "я"', () => {
    const dieLevel = resolveCrisisLevel([
      { role: 'user', content: 'хочу умереть' },
    ]);
    const harmLevel = resolveCrisisLevel([
      { role: 'user', content: 'хочу навредить себе' },
    ]);

    expect(dieLevel).toBe('crisis_high');
    expect(harmLevel).toBe('crisis_high');
  });

  it('сохраняет высокий риск на ближайшие реплики в контексте', () => {
    const level = resolveCrisisLevel([
      { role: 'user', content: 'Я хочу убить себя' },
      { role: 'assistant', content: 'Я рядом. В какой стране ты сейчас?' },
      { role: 'user', content: 'Россия' },
    ]);

    expect(level).toBe('crisis_high');
  });

  it('детектирует watch-уровень по косвенным признакам', () => {
    const level = resolveCrisisLevel([
      { role: 'user', content: 'Я читаю материал про суицид и мне тревожно' },
    ]);

    expect(level).toBe('crisis_watch');
  });

  it('возвращает none для нейтрального текста', () => {
    const level = resolveCrisisLevel([
      { role: 'user', content: 'Хочу лучше спать и меньше прокрастинировать' },
    ]);

    expect(level).toBe('none');
  });

  it('не включает кризисный режим на абстрактное упоминание темы без личного контекста', () => {
    const level = resolveCrisisLevel([
      { role: 'user', content: 'Пишу эссе про профилактику суицида' },
    ]);

    expect(level).toBe('none');
  });

  it('просит только страну, если локаль не даёт страну', () => {
    const result = buildCrisisGuidance({
      messages: [{ role: 'user', content: 'Я хочу умереть' }],
      userLocale: 'ru',
    });

    expect(result.level).toBe('crisis_high');
    expect(result.guidance).toContain('В какой стране ты сейчас находишься?');
    expect(result.guidance).toContain('Этот вопрос обязателен');
    expect(result.guidance).toContain('Не спрашивай адрес/город/геолокацию');
    expect(result.guidance).toContain('Только короткие номера из списка');
    expect(result.guidance).toContain('8-800');
  });

  it('в formal addressing просит страну на вы', () => {
    const result = buildCrisisGuidance({
      messages: [{ role: 'user', content: 'Я хочу умереть' }],
      userLocale: 'ru',
      addressing: 'formal',
    });

    expect(result.guidance).toContain('В какой стране вы сейчас находитесь?');
  });

  it('подставляет экстренный номер, если страна известна', () => {
    const result = buildCrisisGuidance({
      messages: [{ role: 'user', content: 'I feel suicidal' }],
      userLocale: 'en-US',
    });

    expect(result.level).toBe('crisis_high');
    expect(result.countryCode).toBe('US');
    expect(result.emergencyNumbers).toEqual(['911']);
    expect(result.emergencyNumbersDisplay).toBe('911');
    expect(result.guidance).toContain(
      'Если пользователь в US, укажи только короткие номера экстренных служб: 911'
    );
    expect(result.guidance).toContain(
      'Обязательно задай вопрос о стране пребывания'
    );
  });

  it('для стран с несколькими номерами форматирует их без слов через "/"', () => {
    const gb = buildCrisisGuidance({
      messages: [{ role: 'user', content: 'I feel suicidal' }],
      userLocale: 'en-GB',
    });
    const il = buildCrisisGuidance({
      messages: [{ role: 'user', content: 'Мне очень плохо, не хочу жить' }],
      userLocale: 'he-IL',
    });

    expect(gb.emergencyNumbers).toEqual(['999', '112']);
    expect(gb.emergencyNumbersDisplay).toBe('999/112');
    expect(il.emergencyNumbers).toEqual(['100', '101', '102']);
    expect(il.emergencyNumbersDisplay).toBe('100/101/102');
  });

  it('жестко запрещает длинные и неподтвержденные номера в high режиме', () => {
    const result = buildCrisisGuidance({
      messages: [{ role: 'user', content: 'Я думаю о самоубийстве' }],
      userLocale: 'ru-RU',
    });

    expect(result.level).toBe('crisis_high');
    expect(result.emergencyNumbersDisplay).toBe('112');
    expect(result.guidance).toContain('Не добавляй другие номера');
    expect(result.guidance).toContain('8-800');
  });

  it('корректно мержит пользовательский и safety prompt', () => {
    const merged = mergeDeveloperPrompts(
      'Всегда обращайся на ты',
      'РЕЖИМ БЕЗОПАСНОСТИ: CRISIS_HIGH'
    );

    expect(merged).toContain('Всегда обращайся на ты');
    expect(merged).toContain('CRISIS_HIGH');
  });

  it('достаёт страну из локали с разными форматами', () => {
    expect(resolveCountryCodeFromLocale('ru-RU')).toBe('RU');
    expect(resolveCountryCodeFromLocale('en_US')).toBe('US');
    expect(resolveCountryCodeFromLocale('fr')).toBe(null);
  });
});
