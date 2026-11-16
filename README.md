# REVEAL

An original word-guessing game. You get a hint and a hidden word. A countdown runs, and letters flip open one by one as time passes. Guess before time runs out: the earlier you guess, the more points you score.

## Play

Open `index.html` in any browser for Solo. There is no build step, and it works on phones.

Play Locally needs the files served from a web address (for example GitHub Pages), not opened as a local file. It works two ways:

- **One phone hosts (no TV needed):** open Play Locally on a phone. That phone opens a room, shows a QR code and a 4-character code, and its owner plays too. Friends scan the code (or tap Play Locally → "Enter their code"). The host starts each game and each next word, and can show the QR code again with Invite. Everyone sees the ranking after each word. The room lives on the host's phone, so if that phone locks or leaves the page for long, the game stops for everyone.
- **Big screen:** open `host.html` on a TV, laptop or tablet (screens wider than 820 px, or add `?tv=1`). Players scan the QR code and enter their name. Start from the big screen, or from the phone of the first player who joined (marked ★).

Every game screen has an **Exit** button back to the menu. Leaving Daily Play ends that day's try, and the score so far counts.

## How it works

- **Language:** English, aimed at adults and families.
- **Modes:**
  - *Solo:* chase your best score. A wrong guess costs 50 points.
  - *Party (big screen):* everyone guesses the same word on their own phone. Every correct guess scores, faster scores more, and the first correct guess gets +25. A wrong guess costs 50 points (score never goes below 0). 10 words.
  - *Royale (big screen, 2–12 players):* same word for everyone. A wrong guess, or not answering before time runs out, disqualifies you, and so does the slowest correct answer. The TV shows a live ranking with answer times and how many players remain. If nobody gets it, nobody is out. Last one standing wins. When two players are left it becomes a **final showdown**: the first correct answer wins.

- **Level:** Easy, Medium, Hard or Mixed. Words don't repeat on a device until every word at that level has been played.
- **Countdown:** "3, 2, 1, GO!" before every word.
- **Streak:** +10 for each word in a row you get right, up to +50 (Solo and Party).
- **Sound and vibration:** letter pops, a ticking last 5 seconds, right/wrong sounds; phones vibrate on right or wrong. Mute with the Sound button.
- **Rounds:** 10 words per game, with 20, 30 (default) or 45 seconds per word.
- **Reveal:** one letter opens every `time / letters` seconds, in random order. The last letter stays hidden until time runs out.
- **Scoring:** `50 + 100 × (time left / total time) + 15 × hidden letters`. In Solo and Party a wrong guess costs 50 points.
- **Best score** is kept in the browser's local storage.

## How big-screen mode connects

Phones and the big screen talk peer to peer with [PeerJS](https://peerjs.com) (WebRTC). The free public PeerJS server only introduces the devices; game data goes directly between them, and no account or server of our own is needed. It works best when everyone is on the same Wi-Fi. Some mobile networks block direct connections; those players should join the Wi-Fi.

To use your own PeerJS server, add `?peerhost=HOST&peerport=PORT&peerpath=/PATH` to the `host.html` URL. The join link passes it on to phones.

## Files

- `index.html`: Solo
- `host.html`: big screen (Party and Royale)
- `play.html`: phone controller for Play Locally (also shown on top of `host.html` when a phone hosts)
- `exit.js`: the Exit button and its confirm sheet, used on every game screen
- `words.js`: the shared word list
- `party.css`, `net.js`: shared styles and connection settings for big-screen mode
- `theme.css`: the REVEAL brand (forest green, lime, Archivo Black wordmark), loaded last on every page
- `stage.css`, `stage.js`: the game-show look of the guessing screen (countdown ring, gold tiles, confetti), used by every mode
- `vendor/`: PeerJS 1.5.4 and qrcode-generator 1.4.4 (MIT), kept in the repo so the game does not depend on a CDN

## Word list

The everyday words and hints live in `words.js` (956 words: 313 Easy, 320 Medium, 323 Hard), used by Solo, Daily Play, Play Locally and unranked online play. Ranked words are a separate set kept only in the Supabase database (`rk_words`), never in this repo, so they never appear in the other modes. Add an everyday word as `["WORD", "Hint text", level]` (1 Easy, 2 Medium, 3 Hard), using letters A–Z only.

## Drama and replay (drama.js, drama.css)
- **Final 5 seconds:** heartbeat sound (vibration on phones), red pulsing edge, the tiles thump each second.
- **Correct guess splash:** LIGHTNING! (75% of the time left), CLUTCH! (last 3 seconds), GENIUS! (half the letters still hidden), ON FIRE! (3+ streak), with the points flying up.
- **Combo meter** from 2 in a row; it heats up in colour as the streak grows. Wrong guesses shake the stage; a missed word gets a drum roll and crash.
- **End of Solo:** rank title (7 levels, from Warming Up to REVEAL Legend) with points to the next title, gap to your best ("So close!"), a result grid (⚡ fast, 🟩 right, 🟥 missed) and a Share button.
- **End of Party/Royale on phones:** your title (Champion, On the podium, Last one standing…) and a Share button.
- Palette (Lin, v2): background #17231D, lime #C7F58B, text #F6F8F0, surfaces #23372B, muted #A9BBAC.

## Daily Challenge (daily.js)
- 10 words a day (3 Easy, 4 Medium, 3 Hard, in that order), the same for everyone. They're picked from the date (UTC) with a seeded shuffle, so no server is needed for the words.
- 20 seconds per word, one try per device per day (one per account when signed in). A daily streak shows on the home card.
- Online leaderboard on Supabase, table `daily_scores` (SQL below). It's ranked by score, then by fastest total time (unsolved words count as 20 s).
- Only the public **publishable** key is in the code. Never put the secret key in this repo.

```sql
create table daily_scores (
  id bigint generated always as identity primary key,
  day date not null,
  name text not null check (char_length(name) between 1 and 16),
  score int not null check (score between 0 and 6000),
  solved int not null check (solved between 0 and 12),
  time_ms int not null check (time_ms between 0 and 3600000),
  device text not null check (char_length(device) between 8 and 64),
  created_at timestamptz default now(),
  unique (day, device)
);
alter table daily_scores enable row level security;
create policy "anyone can read" on daily_scores for select using (true);
create policy "post for today only" on daily_scores for insert
  with check (day between current_date - 1 and current_date + 1);
```

## Accounts (Google sign-in)

Guests can play everything except ranked. Signing in is optional and adds a unique player name (`@name`, 3–14 lowercase letters, numbers or `_`, rude words blocked), one of 12 ready-made avatars, records saved to the account (fastest, streak, correct, games, best; merged with the device's records on sign-in), and Daily scores posted under the player name.

- `auth.js` (REVEAL_AUTH): Supabase Auth with Google (PKCE), profile load/save, name checks, record sync. Uses only the publishable key.
- `account.js`: the Sign in chip on the home screen and the account sheet. After the first Google sign-in it asks for a player name.
- `avatars.js`: the 12 avatars as inline SVG.
- `vendor/supabase-js-2.118.0.min.js`: Supabase client (MIT, `vendor/LICENSE-supabase-js`).
- `supabase/accounts.sql`: `profiles` table with row level security (anyone can read, players write only their own name, avatar and stats; rating is server-only), plus `daily_scores.user_id`.

One-time setup (do this before merging, or the Sign in button leads to an error):

1. **Google Cloud Console** → create a project → *APIs & Services* → *OAuth consent screen*: External, app name REVEAL, your support email, then publish it. *Credentials* → *Create credentials* → *OAuth client ID* → *Web application*:
   - Authorized JavaScript origins: `https://fadzlinzulkiflee-cpu.github.io`
   - Authorized redirect URIs: `https://nnvgopfuenajnioiqmdk.supabase.co/auth/v1/callback`
2. **Supabase** → *Authentication* → *Sign In / Providers* → *Google*: enable, paste the Client ID and Client secret from step 1. The client secret goes only into Supabase, never into this repo or a chat.
3. **Supabase** → *Authentication* → *URL Configuration*: Site URL `https://fadzlinzulkiflee-cpu.github.io/reveal/`, and add the redirect URL `https://fadzlinzulkiflee-cpu.github.io/reveal/**`. With a custom domain later, add it in both places and in step 1's origins.
4. **Supabase** → *SQL Editor* → paste `supabase/accounts.sql` → *Run*.
5. **Supabase** → *SQL Editor* → paste `supabase/daily-accounts.sql` → *Run*. Daily becomes one try per account (still one per device for guests), a guest score from today moves to the account on sign-in, and device ids are no longer readable by other players.

Tests mock Supabase (the session proxy blocks supabase.co), so the first real sign-in happens live.

## Ranked Battle Royale (server-run)

Signed-in players get ranked matches that run inside Supabase, so no phone decides the result. Guests keep the unranked peer-to-peer game below.

- `supabase/ranked.sql`: tables `rk_matches`, `rk_players`, `rk_words` (no direct access for players) and three functions players can call: `rk_join()`, `rk_state(match)` (polled about twice a second) and `rk_guess(match, text)`. Each call first runs `rk_tick`, which moves the match on when its time is up. The secret word is only sent after a round ends.
- Ranked words live only in the `rk_words` table. They are loaded from a private SQL file kept outside this repo, and none of them are in `words.js`. The first ranked set was public here, so those words moved to the everyday list in November 2026. Add new ranked words only in the database, never in this repo.
- Rules match the unranked game: 20 s per word, wrong or no answer is out, slowest correct is out, nobody out if nobody gets it, first correct wins with 2 left. Lobby waits 20 s, bots fill up to 10 players and never affect ratings. Settings are in `rk_conf()`.
- Rating: everyone starts at 1000. At the end, every signed-in player is compared with every other by finishing place (ELO, K = 32 shared across opponents). A match is rated only with 3 or more signed-in players. Tiers: Bronze below 1100, Silver 1100, Gold 1300, Platinum 1500, Legend 1700.
- Setup: run `supabase/ranked.sql` in the SQL Editor, then the private ranked word file.

## Online Battle Royale (beta, unranked)

`online.html` + `online.js`. Ranked Play on the menu opens it. No game server is needed:

- The first player to search claims a lobby id (`reveal-br-v1-lobby-0..3`) on the PeerJS broker. That player's device hosts the match.
- Others who search connect to the lobby id, get the host's game id, and join.
- The lobby waits 20 s (or until 20 players), then bots fill the match up to 10 players. Bots are marked BOT.
- When the match starts, the host drops the lobby id, so the next searcher opens a new lobby.
- Rules match the TV Royale: 20 s per word, mixed difficulty. A wrong answer or no answer puts you out, and so does the slowest correct answer. If nobody gets it, everyone stays. With 2 left, the first correct answer wins.
- If the host closes the page, the match ends for everyone. This is fine for a prototype; ranked play will move hosting to a server.

Test overrides: `?lobby=6&t=8&rv=2&size=8&bots=0` plus the usual `peerhost/peerport/peerpath/peersecure`.

## Look v3 (playful, Lilac background)

`look.css` loads last on every page. All screens use the dark green background (#17231D) again (light theme rules are kept in look.css but switched off) with flat buttons, Archivo (brand, headings, big numbers) and Inter (everything else), an italic "Frame" REVEAL wordmark (Archivo 900 italic, lime corner frame, lime dot), and one colour per mode: Daily sunshine, Solo lime, Play Locally sky, Ranked grape. Coral is only for wrong answers. The TV (`host.html`, `<html data-screen="tv">`) keeps the dark green background but shares the fonts, buttons and tiles. Style board: https://claude.ai/artifact/A971zhP6tkgwJShAcZ6fxK
