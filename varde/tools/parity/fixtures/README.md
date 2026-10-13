# Синтетические fixtures паритета (1.2b)

Сгенерировано `varde/tools/parity/generate.mjs` (seed фиксирован), руками не править: `pnpm parity:fixtures` пишет, `pnpm parity:fixtures --check` сравнивает. Настоящих данных здесь нет: инициалы — только из списка `INITIALS` (шаблон «Q?X??», ни одно имя такого не даёт), ответы сгенерированы по банку вопросов `kartlegging/public/sporsmal.js` (KI 2026-10-12 — по `f26ee21`) по пути старого runner (`vis`, `vis` вариантов, `valFraa`, `aleine`, `maks`).

| Файл | Что |
| --- | --- |
| `svar.synthetic.jsonl` | 150 строк формата kartlegging `svar.jsonl`; 6 клиентов; tryggleik 2026-10-12 и 2026-10-13, KI 2026-10-13 с K0, KI 2026-10-12 без K0; свободный текст у 21 строк |
| `runde1.synthetic.js` | 40 записей раунда 1 в формате `tools/runde1_fra_excel.py` (`window.RUNDE1 = {namn, dato, svar: [{k, init, svar}]}`), 5 клиентов: daco 10, gasta 9, kviknes 8, maskinsenteret 7, sfhs 6; F2–F19, F15 массивом; 10 пар `(k, init)` совпадают с tryggleik раунда 2 (по 2 на клиента) |
| `tilgang.json` | код ссылки на клиента, 10 символов, как `lagKode()` |
| `kundar.json` | `tilsette`, `open`, `frist` (у sfhs `tilsette = null`) |

Особенности: у daco и gasta есть роли с ≥ 3 и < 3 ответами; у tharaso всего 2 ответа в каждом опроснике; два разных человека с одинаковыми инициалами в daco (tryggleik, однофамильцы); одна строка tryggleik gasta с `leiardel = true` без ответов части B (`leader_empty` в 1.8).

## Краевые строки (номера строк файла, с 1)

- 6: no id
- 31: duplicate id
- 32: duplicate id
- 61: unknown versjon
- 91: unknown k
- 121: leiardel without id

## Строки KI 2026-10-12 (анонимный раунд)

7, 15, 18, 22, 29

## Прогоны golden 1.2c

- (а) все строки, кроме краевых и KI 2026-10-12.
- (б) только строки KI 2026-10-12.

## Ожидаемые счётчики импорта 1.8 (пустая база)

```json
{
  "lines": 150,
  "leiardel": 20,
  "rounds": {
    "tryggleik": {
      "common": 78,
      "leader": 9,
      "clients": {
        "daco": 18,
        "gasta": 15,
        "kviknes": 15,
        "maskinsenteret": 14,
        "sfhs": 14,
        "tharaso": 2
      }
    },
    "ki-2026-10-12": {
      "common": 5,
      "leader": 3,
      "clients": {
        "daco": 2,
        "gasta": 1,
        "kviknes": 1,
        "sfhs": 1
      }
    },
    "ki": {
      "common": 61,
      "leader": 6,
      "clients": {
        "daco": 14,
        "gasta": 12,
        "kviknes": 11,
        "maskinsenteret": 11,
        "sfhs": 11,
        "tharaso": 2
      }
    }
  },
  "rejected": {
    "common": 6,
    "leader": 2,
    "reasons": {
      "no id": 1,
      "duplicate id": 2,
      "unknown versjon": 1,
      "unknown k": 1,
      "leiardel without id": 1,
      "leader_empty": 1
    }
  },
  "dropped_answers": 0
}
```

Сверка: строк = common `accepted` (сумма по раундам) + `rejected.common`; строк с `leiardel = true` (20) = leader `accepted` + `rejected.leader`. Раунд 1 (1.9): `accepted 40`, leader 0.
