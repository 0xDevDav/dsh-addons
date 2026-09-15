# Compito: installare DavCode AGENT (DeepSeek Harness con le modifiche di un repository)

## Obiettivo

Su questo computer deve funzionare **DavCode AGENT** — cioè **DeepSeek Harness (DSH)** con le
modifiche del repository indicato sotto: interfaccia in **italiano**, **superfici dei costi** e
**identità DavCode AGENT** (nome, marchio e icona). Deve essere avviabile con un **doppio clic da un
collegamento sul Desktop**, che si chiama **DavCode AGENT** e mostra **il marchio DavCode** come icona.

Non mi interessa come lo fai. Mi interessa che alla fine sia vero, e che tu me lo dimostri.

## Cosa deve esserci

1. **DeepSeek Harness**, nella versione per cui il repository dichiara di essere stato costruito e
   verificato — leggi il README del repository, che lo dice esplicitamente (al momento in cui scrivo:
   `0.1.6-alpha.1`). **La versione conta**: il pacchetto italiano copre le stringhe di quella release e
   il pacchetto del marchio aggancia sedi e classi di quella release; su una release diversa alcune voci
   resterebbero in inglese e il marchio potrebbe non comparire. **Il collegamento di avvio deve essere
   fissato a quella versione esatta**, così non può partire in silenzio una versione diversa: la riga da
   cambiare è una sola, nel launcher del repository.

2. **Tutte le modifiche di questo repository**: https://github.com/0xDevDav/dsh-addons

   Esploralo per intero: contiene **tre pacchetti** (interfaccia italiana, superfici dei costi, identità
   DavCode AGENT), gli installer, gli strumenti con cui sono stati costruiti e le loro suite di verifica.
   Installa **ogni** modifica che offre, seguendo la procedura che il repository stesso documenta nel
   proprio README — non una tua variante. Ogni pacchetto ha il suo README con le decisioni di progetto,
   gli agganci che usa e ciò che deliberatamente non fa: leggilo, così capisci cosa stai installando
   invece di indovinarlo.

3. **Il collegamento sul Desktop**, creato dallo script del repository (`install/shortcut.ps1` su
   Windows, `install/shortcut.sh` altrove): deve chiamarsi **DavCode AGENT**, eseguire il launcher del
   repository e usare **l'icona del marchio DavCode** che il repository porta con sé
   (`install/launcher/davcode.ico`; rigenerabile con `node tools/brand/make-icon.mjs`). Non va bene
   l'icona generica di Node, né il marchio DeepSeek: se Explorer tiene in cache un'icona vecchia,
   rigenera il collegamento e aggiorna la cache delle icone.

4. **Il Desktop deve restare pulito.** Alla fine sul Desktop ci deve essere **solo il collegamento di
   avvio**: nessuna cartella di codice, nessun clone del repository, nessun file di lavoro lasciato lì.
   Le copie di lavoro stanno altrove, in una posizione **stabile e non temporanea** — l'installazione
   non deve dipendere da una cartella che qualcuno potrebbe cancellare domani.

## Requisiti della macchina

- Node.js e pnpm. Se manca qualcosa, installalo oppure dimmi esattamente cosa manca e perché non puoi.
- Accesso a internet (registry npm e GitHub).
- Il repository dichiara le versioni con cui è stato costruito e verificato (Node, pnpm, sistema
  operativo): se questa macchina se ne discosta, dimmelo prima di procedere e dimmi cosa comporta.
- Se questo computer **non è Windows**, il collegamento di avvio sul Desktop va realizzato con
  l'equivalente del sistema: il repository include anche l'installer e lo script per Unix.
- **Una chiave API DeepSeek, che fornisce Davide**: chiedila a lui quando serve. Non cercarla altrove,
  non tentare di generarla, non usare altre chiavi trovate sulla macchina. Va usata **solo** dentro le
  impostazioni di DSH: non scriverla in nessun file, non stamparla, non metterla in un commit. Senza
  quella chiave l'agente non risponde e il saldo non si legge.

## Come si riconosce che è riuscito

Non dichiarare il lavoro finito sulla base di file presenti: verifica il comportamento. Con DSH avviato
**dal collegamento sul Desktop**, l'interfaccia deve mostrare:

- **il marchio DavCode AGENT** al posto del pesce DeepSeek: nella riga in alto della barra laterale, nella
  barra laterale ridotta a icona, e sulla schermata a sessione vuota **da solo** (senza il saluto e senza
  il badge "Anteprima", in qualunque lingua); il titolo della finestra e l'icona della scheda del browser
  devono dire `DavCode AGENT`;
- **tutto in italiano**, comprese le parti nuove di questa release: il pannello **Terminale** nella barra
  laterale, le **sessioni archiviate** nelle impostazioni, la scelta fra le **modalità agente** con
  **Auto review**, e la scheda **Registro**;
- **accanto alle statistiche del compositore** la cifra spesa da questa sessione, **subagenti compresi**,
  con il dettaglio di input in cache, input non in cache e output;
- **sopra "Nuova sessione"** un avviso che dice se il momento attuale è tariffa di picco o fuori picco;
- **accanto a Impostazioni** il saldo del mio account in dollari, letto dal provider.

Restano **volutamente in inglese** gli URL delle API, i token dei comandi (`goal`, `plan`, `compact`…),
il nome `Auto review`, il badge `EXP` e i formati di durata: non sono dimenticanze, non "correggerli".

E sul Desktop deve essere rimasto **solo il collegamento di avvio**: se trovi cartelle di codice, cloni
o file di lavoro, vanno spostati altrove prima di considerare finito.

Se puoi pilotare un browser, guarda l'interfaccia con i tuoi occhi. Se non puoi, verifica ciò che il
server serve (il bundle del browser e le rotte dei costi) e dimmi che la prova è indiretta: preferisco
sapere quale prova hai fatto che leggere un "fatto".

## Vincoli

- **Non modificare l'installazione di DSH.** Le aggiunte vivono nella home di DSH come bundle di
  profilo: è ciò che permette loro di sopravvivere agli aggiornamenti del harness.
- I bundle del browser vengono letti e firmati all'avvio del processo: **una ricarica della pagina non
  basta**. Riavvia DSH prima di dichiarare che qualcosa funziona.
- Il repository porta con sé le proprie suite di verifica: **eseguile** e riporta l'esito.
- La scelta della lingua italiana deve **persistere** fra un avvio e l'altro, non valere una volta sola.
- **Non aggirare un errore modificando i file originali di DSH**, e non inventare una seconda
  installazione parallela. Se un passaggio non riesce, fermati e raccontami cosa hai trovato: un
  fallimento spiegato vale più di un successo apparente.

## Cosa voglio alla fine

Un rapporto breve e concreto:

- versione di DSH installata e da dove parte (e come è fissata nel collegamento);
- dove sta il collegamento sul Desktop, come si chiama, cosa esegue e **quale icona mostra**;
- **conferma che sul Desktop è rimasto solo il collegamento**, e dove hai messo tutto il resto;
- quali modifiche del repository sono attive;
- cosa hai verificato e **con quale prova** (incluso il marchio: riga, rail, schermata vuota, titolo);
- se e quando ti sei fatto dare la chiave API da Davide;
- tutto ciò che non sei riuscito a verificare, o che non torna.
