# Glossario e regole di traduzione — DSH Web GUI (EN → IT)

Stai traducendo l'interfaccia dell'applicazione **DeepSeek Harness (DSH)**, un agente di
codifica con GUI web. Le stringhe sono etichette, pulsanti, messaggi, tooltip, voci di menu,
titoli di sezione e testi di stato.

## Regole assolute

1. **Non modificare i segnaposto.** Ogni token nella forma `{nome}` (es. `{count}`, `{name}`,
   `{percent}`, `{turns}`) deve restare identico, con lo stesso nome e le stesse graffe.
   Puoi riordinarli nella frase se la sintassi italiana lo richiede.
2. **Non tradurre i valori puramente formali**: se il valore è solo punteggiatura, un simbolo,
   un numero o un formato (es. `","`, `"{value}K"`, `"{seconds}s"`, `"{milliseconds}ms"`),
   restituiscilo **identico**. Nei formati puoi tradurre solo le parole, non i simboli.
3. **Mantieni intatti** i riferimenti tecnici, i percorsi, i nomi di comando e le scorciatoie:
   `` `code` ``, `/model`, `@file`, `SKILL.md`, `Cmd/Ctrl+Enter`, `Shift+Tab`, nomi di file.
4. **Lunghezza**: sono etichette di UI. Usa la formulazione italiana più naturale ma **compatta**;
   evita perifrasi lunghe dove una o due parole bastano.
5. **Stile**: italiano neutro con verbi all'imperativo di 2ª persona singolare per i comandi
   ("Copia", "Invia", "Elimina"), come da convenzione delle UI italiane. Niente "tu" esplicito.
   Maiuscola solo a inizio frase, salvo nomi propri.
6. **Punteggiatura**: usa l'ellissi `…` (un carattere) dove la usa l'inglese; usa le virgolette
   italiane « » solo se il testo originale le usa davvero.
7. **Niente inglese residuo**, tranne i termini elencati come "da mantenere" qui sotto.
8. Il cinese (`zh`) è fornito **solo come aiuto di disambiguazione** per capire il senso di
   etichette inglesi molto brevi. **Non tradurre dal cinese** e non far trasparire il cinese.

## Terminologia vincolante (usala SEMPRE in modo coerente)

| Inglese | Italiano |
|---|---|
| session | sessione |
| turn | turno |
| step | passo |
| tool / tool call | strumento / chiamata a strumento |
| agent | agente |
| subagent | subagente |
| model | modello |
| workspace | area di lavoro |
| settings | impostazioni |
| sidebar | barra laterale |
| approval / approve | approvazione / approva |
| permission | autorizzazione |
| plan | piano |
| goal | obiettivo |
| background job / job | attività in background / attività |
| attachment | allegato |
| context | contesto |
| compaction / compact | compattazione / compatta |
| reasoning | ragionamento |
| outline / turn outline | panoramica / panoramica dei turni |
| deliverables | file prodotti |
| message | messaggio |
| notification | notifica |
| error / warning | errore / avviso |
| loading | caricamento |
| transcript (view) | trascrizione |
| steer (a running turn) | guida (inserisci un messaggio nell'esecuzione in corso) |
| queue (messages) | coda |
| token usage | utilizzo dei token |
| cache hit | cache hit |
| read-only | sola lettura |
| full access | accesso completo |
| custom | personalizzato |
| default | predefinito |
| overview | panoramica |
| details | dettagli |
| retry | riprova |
| dismiss | ignora |
| copy | copia |
| save | salva |
| delete | elimina |
| search | cerca |
| send | invia |
| stop | interrompi |
| edit | modifica |
| create | crea |
| open | apri |
| close | chiudi |
| cancel | annulla |
| confirm | conferma |
| enable / disable | attiva / disattiva |
| expand / collapse | espandi / comprimi |
| show / hide | mostra / nascondi |
| back / next / previous | indietro / avanti / precedente |
| reset | reimposta |
| apply | applica |
| select / choose | seleziona / scegli |
| unknown | sconosciuto |
| none | nessuno |

## Termini da MANTENERE in inglese (prestiti consolidati nell'italiano tecnico o nomi propri)

DeepSeek, DSH, GitHub, JSON, Markdown, HTML, CSS, PDF, SVG, URL, API, CLI, AI, LLM, HTTP, SSE,
Token, Prompt, Plugin, Workflow, Sandbox, Checkpoint, Rollback, Skill, Preset, Cache, Commit,
Diff, Feedback, Chat, Job ID, Cron, Streaming, Reasoning effort, Model ID, UUID, Home, End.

Per i nomi dei tool (`bash`, `read`, `write`, `edit`, `grep`, `glob`, `web_search`, `web_fetch`,
`todo_write`, `ask_user_question`, `task`, `subagent`, `workflow`, `ralph`, `job_*`, `skill`)
**non tradurre il nome**, ma traduci eventuale testo descrittivo attorno.

## Etichette di prodotto

- `DSH Local Build` → `Build locale DSH`
- `Built-in` → `Integrato` (plurale `Integrati`)
- `Creator mode` → `modalità Creator` (Creator resta nome proprio)
- `Minimal mode` → `modalità minimale`
- `Standard mode` → `modalità standard`

## Esempi di calibrazione

- `"Cancel"` → `"Annulla"`
- `"Session statistics"` → `"Statistiche della sessione"`
- `"{turns} turns {steps} steps"` → `"{turns} turni {steps} passi"`
- `"Cache hit {percent}%"` → `"Cache hit {percent}%"`
- `"… truncated at {total} characters"` → `"… troncato a {total} caratteri"`
- `"Copy property path"` → `"Copia percorso proprietà"`
- `"Danger full access"` → `"Accesso completo pericoloso"`
- `"New folder in \"{name}\""` → `"Nuova cartella in «{name}»"` (mantieni il segnaposto)
- `"Cmd/Ctrl+Enter steer send all queued messages"` → `"Cmd/Ctrl+Enter guida: invia tutti i messaggi in coda"`
