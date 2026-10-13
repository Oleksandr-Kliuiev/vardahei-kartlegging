# Уведомление респондентам v2 (0.18) — на утверждение Oleksandr (ворота G2)

**Статус: pending (Oleksandr).** Утверждение — ответом в этом файле (строка «Утверждение» внизу). При правках кодер обновляет JSON, тест и hash; после утверждения — отдельный evidence `docs/varde/evidence/stage-0/0.18-approval.md` с hash JSON-файлов. Утверждение нужно к 1.13d (показ в runner).

Файлы: `varde/apps/runner/src/i18n/notice-v2.nn.json`, `notice-v2.en.json`, `notice-v2.nb.json` (ровно `{}`: букмол появится по переключателю шаблона, задача 1.3). Кода runner ещё нет — файлы подключит 1.12. Текущий раунд kartlegging не трогаем. Тест — `varde/apps/runner/test/notice-v2.test.ts` (ключи nn = en, стоп-список букмола, нет `anonym` в `notice.identified.*`, нет обещаний удаления по сроку и «aldri/never» рядом с «bedrifta/company»).

Как показываются (1.13d): идентифицированный опросник — `notice.identified.*` + `notice.common.*`; анонимный — `notice.anonymous.*` + `notice.common.*`.

## Что именно утверждается

| Ключ | nn | en | Пояснение (на чём держится) |
| --- | --- | --- | --- |
| `notice.identified.intro` | I dette spørjeskjemaet skriv du inn initialane dine. Då kan vi i Vardahei IT sjå korleis svara endrar seg frå runde til runde. | In this survey you enter your initials. This lets us at Vardahei IT see how the answers change from round to round. | Инициалы обязательны (12.10); зачем — сравнение по людям между раундами (ADR-025). |
| `notice.identified.who_sees` | Svara per person ser berre Vardahei IT, det vil seie tre tilsette hos oss. | Only Vardahei IT sees the answers per person, that is, three people on our staff. | 12.10 и 13.10: ответы по человеку видят трое сотрудников Vardahei IT. Формулировка из пакета; смысл «в обычной работе» — см. вопрос 1. |
| `notice.identified.client_gets` | Bedrifta di får eit samla bilete utan initialar. | Your company gets an overall picture without initials. | 12.10: клиент получает сводку без инициалов. |
| `notice.identified.retention` | Vi tek vare på svara så lenge Vardahei IT driv kartlegginga. Det finst inga fast slettedato; svara blir sletta på førespurnad. | We keep the answers for as long as Vardahei IT runs the survey programme. There is no fixed deletion date; the answers are deleted on request. | 12.10: хранение бессрочно, удаления по таймеру нет, удаление только по явному запросу (ADR-017). Критерий, не срок. |
| `notice.identified.roles` | Bedrifta di er behandlingsansvarleg for svara, og Vardahei IT er databehandlar. | Your company is the data controller for the answers, and Vardahei IT is the data processor. | 13.10: databehandleravtale покрывает опросники (ADR-017). |
| `notice.identified.client_rights` | Som behandlingsansvarleg kan bedrifta krevje å få utlevert alle svara, også svara per person med initialar, eller krevje at alle svara blir sletta. | As the data controller, the company can require us to hand over all answers, including the answers per person with initials, or require that all answers are deleted. | 13.10: по требованию клиента Vardahei возвращает или удаляет данные; честно называет, что выдача включает строки с инициалами (остаточный риск ADR-017). |
| `notice.anonymous.intro` | Du skriv ikkje inn namn eller initialar. Vardahei IT ser svara, men ikkje kven som svarte. Det du skriv i fritekst, kan likevel seie noko om kven du er. | You do not enter your name or initials. Vardahei IT sees the answers, but not who answered. What you write in free text may still say something about who you are. | 13.10: анонимность выбирается для каждого опросника и защищает от клиента, не от трёх админов; админы видят строки и свободный текст (ADR-025). Последнее предложение — предупреждение, не обещание. |
| `notice.anonymous.client_gets` | Bedrifta di får eit samla bilete. Vi tek vare på svara utan fast slettedato og slettar dei på førespurnad. Bedrifta kan krevje å få utlevert svara eller at dei blir sletta. | Your company gets an overall picture. We keep the answers without a fixed deletion date and delete them on request. The company can require us to hand over the answers or delete them. | Сводка для клиента; хранение и право клиента те же, что в идентифицированном режиме (12.10, 13.10). В пакете нет отдельных ключей хранения для анонимного режима — см. вопрос 2. |
| `notice.common.ai_processing` | Vi kan bruke ein KI-modell når vi arbeider med resultata. Modellen får berre samla tal, ikkje svar per person. | We may use an AI model when we work with the results. The model only gets combined figures, not answers per person. | ADR-011: ассистент видит агрегаты через privacy, строк и инициалов нет. Ручные выдержки свободного текста (ADR-011) в тексте не названы — см. вопрос 3. |
| `notice.common.exact_count` | Vi viser kor mange frå bedrifta som har svart. Talet seier at nokon har vore med, ikkje kva dei har svart. | We show how many people from the company have answered. The number shows that someone took part, not what they answered. | ADR-021, правило 6: точный счётчик ответов — названное исключение. |
| `notice.common.leader_not_anonymous` | Svara frå leiaren er ikkje anonyme. Vardahei IT brukar dei når vi set oss ned saman med leiinga, og dei er ikkje med i det samla biletet bedrifta får. | The manager's answers are not anonymous. Vardahei IT uses them when we sit down with the management, and they are not part of the overall picture the company gets. | 13.10: ответы руководителя не анонимны, правило (a); в сводку клиенту не входят (ADR-025). |
| `notice.common.small_groups` | Grupper med færre enn tre personar blir ikkje viste kvar for seg i det samla biletet. | Groups of fewer than three people are not shown on their own in the overall picture. | k = 3 (ADR-021, `varde/config/privacy.json`). |

## Вопросы к Oleksandr

1. `who_sees` дословно по пакету («Svara per person ser berre Vardahei IT»), а `client_rights` говорит, что клиент по требованию получит и строки с инициалами. Так ADR-017 снимает остаточный риск. Если нужно мягче, вариант: «I det daglege arbeidet ser berre Vardahei IT svara per person …».
2. В анонимном режиме хранение и право клиента записаны в `notice.anonymous.client_gets` (отдельных ключей в пакете нет). Если хотите отдельные строки — добавлю ключи `notice.anonymous.retention` и `notice.anonymous.client_rights`.
3. Ручные выдержки свободного текста для ассистента (ADR-011) в тексте не упомянуты: их пока нет (этап 2b). Если их нужно назвать сразу — допишу предложение в `ai_processing`.

## Hash текущей версии (не утверждена)

| Файл | sha256 |
| --- | --- |
| `notice-v2.nn.json` | `f67c26530a91c5617f63ef6a550076afd821353276873d4465dc011631e33d88` |
| `notice-v2.en.json` | `dcbecbecdab92896dd9e9e58b89008d01285288494d6b904220f7d49c4b90d81` |
| `notice-v2.nb.json` | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |

## Утверждение

- Утверждено Oleksandr: **pending** (дата: —)
